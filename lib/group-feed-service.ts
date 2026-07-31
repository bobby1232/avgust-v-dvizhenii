import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, getPool } from "@/db/client";
import { activities, activityDays, achievementDefinitions, auditLogs, contestSettings, groupFeedEvents, userAchievements, users } from "@/db/schema";
import { activeCompetition, communityData, favoriteActivity, userStats } from "./data";
import { competitionPhase, getCompetitionDate } from "./competition-time";
import { getGroupFeedSchedule, getMoscowTime } from "./group-feed-schedule";
import { escapeTelegramHtml as h, sendLongTelegramMessage, sendTelegramPhotoPost, TelegramApiError } from "./telegram-bot";

type Event = typeof groupFeedEvents.$inferSelect;
const MAX_ATTEMPTS = 5;

function shortError(error: unknown) {
  return (error instanceof Error ? error.message : "Unknown Telegram error")
    .replace(/bot\d+:[^/\s]+/gi, "bot[redacted]")
    .slice(0, 500);
}

async function claimEvents(
  competitionId: number,
  digestIntervalMinutes: number,
  publishEachActivityEnabled: boolean,
): Promise<Event[]> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE group_feed_events SET status='failed', error_message='Processing lease expired', updated_at=now()
       WHERE competition_id=$1 AND status='processing' AND last_attempt_at < now() - interval '10 minutes'`,
      [competitionId],
    );
    const result = await client.query<Event>(
      `WITH picked AS (
         SELECT id
         FROM group_feed_events
         WHERE competition_id=$1
           AND available_at<=now()
           AND (
             event_type <> 'activity'
             OR $4::boolean = true
             OR CASE
               WHEN jsonb_typeof(payload->'evidencePhotos') = 'array'
                 THEN jsonb_array_length(payload->'evidencePhotos') > 0
               ELSE false
             END
             OR created_at <= now() - ($3 * interval '1 minute')
           )
           AND (status='pending' OR status='failed')
           AND attempt_count < $2
         ORDER BY available_at,id
         FOR UPDATE SKIP LOCKED
         LIMIT 100
       )
       UPDATE group_feed_events e
       SET status='processing', attempt_count=e.attempt_count+1,
           last_attempt_at=now(), updated_at=now(), error_message=NULL
       FROM picked
       WHERE e.id=picked.id
       RETURNING e.*`,
      [competitionId, MAX_ATTEMPTS, digestIntervalMinutes, publishEachActivityEnabled],
    );
    await client.query("COMMIT");
    return result.rows.map((row: any) => ({
      ...row,
      competitionId: Number(row.competition_id),
      eventType: row.event_type,
      entityType: row.entity_type,
      entityId: String(row.entity_id),
      dedupeKey: row.dedupe_key,
      availableAt: row.available_at,
      sentAt: row.sent_at,
      telegramMessageId: row.telegram_message_id,
      attemptCount: row.attempt_count,
      lastAttemptAt: row.last_attempt_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function finish(
  events: Event[],
  status: "sent" | "failed" | "skipped",
  messageId?: number,
  error?: unknown,
) {
  if (!events.length) return;
  const retryAfter = error instanceof TelegramApiError ? error.retryAfter : undefined;
  await db.update(groupFeedEvents).set({
    status,
    sentAt: status === "sent" ? new Date() : null,
    telegramMessageId: messageId ? String(messageId) : null,
    errorMessage: error ? shortError(error) : null,
    availableAt: retryAfter ? new Date(Date.now() + retryAfter * 1000) : new Date(),
    updatedAt: new Date(),
  }).where(inArray(groupFeedEvents.id, events.map((event) => event.id)));
}

async function schedule(
  competition: Awaited<ReturnType<typeof activeCompetition>>,
  settings: typeof contestSettings.$inferSelect,
  now: Date,
) {
  if (competitionPhase(competition, now) !== "active") return;
  const date = getCompetitionDate(now, competition.timezone);
  const time = getMoscowTime(now);
  const publicationTimes = getGroupFeedSchedule(settings);
  const values: Array<typeof groupFeedEvents.$inferInsert> = [];
  for (const [slot, due] of [
    ["day", publicationTimes.leaderboardDayTime],
    ["evening", publicationTimes.leaderboardEveningTime],
  ] as const) {
    if (settings.leaderboardAnnouncementsEnabled && time >= due.slice(0, 5)) {
      values.push({
        competitionId: competition.id,
        eventType: "leaderboard",
        entityType: "competition",
        entityId: String(competition.id),
        dedupeKey: `leaderboard:${competition.id}:${date}:${slot}`,
        payload: { competitionDate: date, slot },
      });
    }
  }
  if (settings.dailySummaryEnabled && time >= publicationTimes.dailySummaryTime) {
    values.push({
      competitionId: competition.id,
      eventType: "daily-summary",
      entityType: "competition",
      entityId: String(competition.id),
      dedupeKey: `daily-summary:${competition.id}:${date}:evening`,
      payload: { competitionDate: date, slot: "evening" },
    });
  }
  if (values.length) await db.insert(groupFeedEvents).values(values).onConflictDoNothing();
}

async function audit(
  action: string,
  competitionId: number,
  events: Event[],
  publicationType: string,
  messageId?: number,
  result = "sent",
) {
  await db.insert(auditLogs).values({
    action,
    entityType: "group_feed",
    entityId: events.map((event) => event.id).join(","),
    result,
    payload: {
      competitionId,
      eventIds: events.map((event) => event.id),
      entityIds: events.map((event) => event.entityId),
      publishedCount: events.length,
      telegramMessageId: messageId ? String(messageId) : undefined,
      publicationType,
      result,
    },
  });
}

function participantName(displayName: unknown, telegramUsername: unknown) {
  const name = h(String(displayName));
  const username = typeof telegramUsername === "string"
    ? telegramUsername.trim().replace(/^@+/, "")
    : "";
  return username ? `${name} (@${h(username)})` : name;
}

function activityText(events: Event[], todayActive: number, total: number, todayActivities: number) {
  const lines = events.map((event) => {
    const payload = event.payload as any;
    const name = payload.activityType === "Другое"
      ? payload.customActivityName || payload.activityType
      : payload.activityType;
    const detail = payload.description
      ? ` — ${h(String(payload.description).slice(0, 140))}`
      : "";
    const department = payload.department ? ` (${h(payload.department)})` : "";
    return `🏃 ${participantName(payload.displayName, payload.telegramUsername)}${department} — ${h(name)}, ${payload.durationMinutes} мин.${detail}`;
  });
  return [
    "🔥 <b>Новые активности в GOSUP GAMES</b>",
    "",
    ...lines,
    "",
    `Сегодня уже отметились: <b>${todayActive} из ${total}</b>`,
    `Всего активностей сегодня: <b>${todayActivities}</b>`,
    "",
    "Не важно, что ты делаешь. Важно — не останавливаться.",
    "",
    "Открыть приложение: @Gosup_comp_bot",
  ].join("\n");
}

function singleActivityText(event: Event) {
  const payload = event.payload as any;
  const name = payload.activityType === "Другое"
    ? payload.customActivityName || payload.activityType
    : payload.activityType;
  const detail = payload.description
    ? `\n${h(String(payload.description).slice(0, 300))}`
    : "";
  const department = payload.department ? ` (${h(payload.department)})` : "";
  return [
    "🏃 <b>Новая активность в GOSUP GAMES</b>",
    "",
    `${participantName(payload.displayName, payload.telegramUsername)}${department}`,
    `<b>${h(name)}</b> · ${payload.durationMinutes} мин.${detail}`,
    "",
    "Открыть приложение: @Gosup_comp_bot",
  ].join("\n");
}

function eventPhotos(event: Event): string[] {
  const photos = (event.payload as Record<string, unknown>).evidencePhotos;
  return Array.isArray(photos)
    ? photos.filter((photo): photo is string => typeof photo === "string" && photo.length > 0)
    : [];
}

export async function processGroupFeed(now = new Date()) {
  const competition = await activeCompetition();
  const [stored] = await db.select().from(contestSettings)
    .where(eq(contestSettings.competitionId, competition.id))
    .limit(1);
  let settings = stored;
  if (!settings) {
    [settings] = await db.insert(contestSettings)
      .values({ competitionId: competition.id })
      .onConflictDoNothing()
      .returning();
    if (!settings) {
      [settings] = await db.select().from(contestSettings)
        .where(eq(contestSettings.competitionId, competition.id))
        .limit(1);
    }
  }
  const chatId = settings?.reportChatId ?? process.env.TELEGRAM_REPORT_CHAT_ID;
  if (!chatId) {
    return { sent: 0, skipped: 0, failed: 0, disabled: true, reason: "GROUP_CHAT_NOT_CONFIGURED" as const };
  }
  if (!settings.groupFeedEnabled) {
    return { sent: 0, skipped: 0, failed: 0, disabled: true, reason: "GROUP_FEED_DISABLED" as const };
  }

  await schedule(competition, settings, now);
  const events = await claimEvents(
    competition.id,
    settings.activityDigestIntervalMinutes,
    settings.publishEachActivityEnabled,
  );
  const result = {
    activityPostsSent: 0,
    activityDigestsSent: 0,
    activitiesPublished: 0,
    achievementsPublished: 0,
    leaderboardsPublished: 0,
    dailySummariesPublished: 0,
    skipped: 0,
    failed: 0,
  };
  const today = getCompetitionDate(now, competition.timezone);
  const community = await communityData();
  const dayActivities = await db.select().from(activities).where(and(
    eq(activities.competitionId, competition.id),
    eq(activities.activityDate, today),
    eq(activities.status, "approved"),
  ));
  const todayDays = await db.select().from(activityDays).where(and(
    eq(activityDays.competitionId, competition.id),
    eq(activityDays.activityDate, today),
  ));

  const activityEvents = events.filter((event) => event.eventType === "activity");
  const individualEvents = settings.publishEachActivityEnabled
    ? activityEvents
    : activityEvents.filter((event) => eventPhotos(event).length > 0);
  const individualIds = new Set(individualEvents.map((event) => event.id));
  const digestEvents = activityEvents.filter((event) => !individualIds.has(event.id));

  for (const event of individualEvents) {
    try {
      const sent = await sendTelegramPhotoPost(chatId, eventPhotos(event), singleActivityText(event));
      await finish([event], "sent", sent.message_id);
      await audit("GROUP_ACTIVITY_SENT", competition.id, [event], "activity", sent.message_id);
      result.activityPostsSent += 1;
      result.activitiesPublished += 1;
    } catch (error) {
      await finish([event], "failed", undefined, error);
      await audit("GROUP_PUBLICATION_FAILED", competition.id, [event], "activity", undefined, "failed");
      result.failed += 1;
    }
  }

  if (!settings.activityDigestEnabled) {
    await finish(digestEvents, "skipped");
    result.skipped += digestEvents.length;
  } else {
    for (let offset = 0; offset < digestEvents.length; offset += 15) {
      const batch = digestEvents.slice(offset, offset + 15);
      try {
        const sent = await sendLongTelegramMessage(
          chatId,
          activityText(batch, todayDays.length, community.registeredParticipants, dayActivities.length),
        );
        const messageId = sent.at(-1)!.message_id;
        await finish(batch, "sent", messageId);
        await audit("GROUP_ACTIVITY_DIGEST_SENT", competition.id, batch, "activity_digest", messageId);
        result.activityDigestsSent += 1;
        result.activitiesPublished += batch.length;
      } catch (error) {
        await finish(batch, "failed", undefined, error);
        await audit("GROUP_PUBLICATION_FAILED", competition.id, batch, "activity_digest", undefined, "failed");
        result.failed += batch.length;
      }
    }
  }

  for (const event of events.filter((item) => item.eventType === "achievement")) {
    if (!settings.achievementAnnouncementsEnabled) {
      await finish([event], "skipped");
      result.skipped += 1;
      continue;
    }
    const [award] = await db.select({
      row: userAchievements,
      user: users,
      definition: achievementDefinitions,
    }).from(userAchievements)
      .innerJoin(users, eq(users.id, userAchievements.userId))
      .innerJoin(achievementDefinitions, eq(achievementDefinitions.id, userAchievements.achievementId))
      .where(and(
        eq(userAchievements.id, Number(event.entityId)),
        isNull(userAchievements.revokedAt),
      ))
      .limit(1);
    if (!award) {
      await finish([event], "skipped");
      result.skipped += 1;
      continue;
    }
    const stats = await userStats(award.user.id, competition.id);
    const manual = award.row.source === "manual";
    const text = [
      manual ? "🎖 <b>Специальный бейдж</b>" : "🏅 <b>Новый бейдж!</b>",
      "",
      `${participantName(award.user.displayName, award.user.telegramUsername)} получает:`,
      `${h(award.definition.emoji)} <b>«${h(award.definition.name)}»</b>`,
      "",
      h(award.definition.description),
      `Серия: <b>${stats.currentStreak}</b> · активных дней: <b>${stats.activeDays}</b>`,
      "Поздравим реакциями! 👏",
      "",
      "Открыть приложение: @Gosup_comp_bot",
    ].join("\n");
    try {
      const sent = await sendLongTelegramMessage(chatId, text);
      const messageId = sent.at(-1)!.message_id;
      await finish([event], "sent", messageId);
      await audit("GROUP_ACHIEVEMENT_SENT", competition.id, [event], "achievement", messageId);
      result.achievementsPublished += 1;
    } catch (error) {
      await finish([event], "failed", undefined, error);
      await audit("GROUP_PUBLICATION_FAILED", competition.id, [event], "achievement", undefined, "failed");
      result.failed += 1;
    }
  }

  for (const event of events.filter((item) =>
    item.eventType === "leaderboard" || item.eventType === "daily-summary")) {
    if (competitionPhase(competition, now) !== "active") {
      await finish([event], "skipped");
      result.skipped += 1;
      continue;
    }
    let text: string;
    let action: string;
    if (event.eventType === "leaderboard") {
      const top = community.participants.slice(0, 10).map((participant, index) =>
        `${["🥇", "🥈", "🥉"][index] ?? `${index + 1}.`} ${participantName(participant.displayName, participant.telegramUsername)} — ${participant.activeDays} активных дней · серия ${participant.currentStreak} 🔥 · ${participant.achievementCount} бейджа`);
      const remaining = competition.endDate
        ? Math.max(0, Math.ceil((Date.parse(competition.endDate) - Date.parse(today)) / 86400000))
        : "—";
      text = [
        `🏆 <b>Лидеры GOSUP GAMES — ${h(today)}</b>`,
        "",
        ...top,
        "",
        `Сегодня отметились: <b>${todayDays.length} участников</b>`,
        `В игре: <b>${community.registeredParticipants} участник</b>`,
        `До завершения игры: <b>${remaining} дней</b>`,
        "",
        "Продолжаем движение! 💪",
        "",
        "Открыть таблицу: @Gosup_comp_bot",
      ].join("\n");
      action = "GROUP_LEADERBOARD_SENT";
    } else {
      const achievementsToday = await db.select().from(userAchievements).where(and(
        eq(userAchievements.competitionId, competition.id),
        isNull(userAchievements.revokedAt),
        sql`(${userAchievements.awardedAt} at time zone ${competition.timezone})::date = ${today}::date`,
      ));
      const popular = favoriteActivity(dayActivities);
      const best = community.participants[0]?.currentStreak ?? 0;
      text = [
        "🌙 <b>Итоги дня GOSUP GAMES</b>",
        "",
        `✅ Сегодня отметились: ${todayDays.length} участников`,
        `⏳ Ещё в пути: ${Math.max(0, community.registeredParticipants - todayDays.length)} участников`,
        `🏃 Добавлено активностей: ${dayActivities.length}`,
        `⏱ Общее время движения: ${dayActivities.reduce((sum, activity) => sum + activity.durationMinutes, 0).toLocaleString("ru-RU")} минут`,
        `🔥 Лучшая серия: ${best} дней`,
        `🏅 Получено новых бейджей: ${achievementsToday.length}`,
        "",
        popular
          ? `Самая популярная активность сегодня — ${h(popular)}.`
          : "Сегодня ещё можно успеть добавить активность.",
        "",
        "Завтра продолжаем. Главное — не останавливаться.",
        "",
        "Продолжить в приложении: @Gosup_comp_bot",
      ].join("\n");
      action = "GROUP_DAILY_SUMMARY_SENT";
    }
    try {
      const sent = await sendLongTelegramMessage(chatId, text);
      const messageId = sent.at(-1)!.message_id;
      await finish([event], "sent", messageId);
      await audit(action, competition.id, [event], event.eventType, messageId);
      if (event.eventType === "leaderboard") {
        result.leaderboardsPublished += 1;
      } else {
        result.dailySummariesPublished += 1;
      }
    } catch (error) {
      await finish([event], "failed", undefined, error);
      await audit("GROUP_PUBLICATION_FAILED", competition.id, [event], event.eventType, undefined, "failed");
      result.failed += 1;
    }
  }
  return result;
}
