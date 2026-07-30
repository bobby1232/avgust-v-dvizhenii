import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activityDays,
  contestSettings,
  notificationLogs,
  users,
} from "@/db/schema";
import { activeCompetition } from "./data";
import { competitionPhase, getCompetitionDate } from "./competition-time.ts";
import { appUrl, sendTelegramMessage } from "./telegram-bot";

export async function sendEveningReminders(now = new Date()) {
  const competition = await activeCompetition();
  if (competitionPhase(competition, now) !== "active") return { sent: 0, skipped: 0, failed: 0 };
  const today = getCompetitionDate(now, competition.timezone);
  const [settings] = await db.select().from(contestSettings)
    .where(eq(contestSettings.competitionId, competition.id)).limit(1);
  if (settings && !settings.remindersEnabled) return { sent: 0, skipped: 0, failed: 0 };
  const recipients = await db.select({
    id: users.id,
    telegramId: users.telegramId,
  }).from(users).leftJoin(activityDays, and(
    eq(activityDays.competitionId, competition.id),
    eq(activityDays.userId, users.id),
    eq(activityDays.activityDate, today),
  )).where(and(
    eq(users.isActive, true),
    eq(users.notificationsEnabled, true),
    isNull(activityDays.id),
  ));

  const result = { sent: 0, skipped: 0, failed: 0 };
  for (const recipient of recipients) {
    const [log] = await db.insert(notificationLogs).values({
      competitionId: competition.id,
      userId: recipient.id,
      notificationType: "evening_reminder",
      notificationDate: today,
      status: "pending",
    }).onConflictDoNothing().returning();
    if (!log) {
      result.skipped += 1;
      continue;
    }
    try {
      const message = await sendTelegramMessage(
        recipient.telegramId,
        "Сегодня ещё нет отметки активности.\nДо завершения игрового дня осталось несколько часов.\nНе важно, что ты делаешь. Важно — не останавливаться.",
        { buttonText: "Отметить активность", buttonUrl: appUrl() },
      );
      await db.update(notificationLogs).set({
        sentAt: new Date(),
        status: "sent",
        telegramMessageId: String(message.message_id),
      }).where(eq(notificationLogs.id, log.id));
      result.sent += 1;
    } catch (error) {
      await db.update(notificationLogs).set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown Telegram error",
      }).where(eq(notificationLogs.id, log.id));
      result.failed += 1;
    }
  }
  return result;
}
