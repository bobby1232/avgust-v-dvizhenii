import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activityDays,
  contestSettings,
  notificationLogs,
  users,
} from "@/db/schema";
import { activeCompetition } from "./data";
import { competitionPhase, getCompetitionDate, getCompetitionDateTime } from "./competition-time";
import { appUrl, sendTelegramMessage } from "./telegram-bot";

export async function sendEveningReminders(now = new Date()) {
  const competition = await activeCompetition();
  if (competitionPhase(competition, now) !== "active") return { sent: 0, skipped: 0, failed: 0 };
  const today = getCompetitionDate(now, competition.timezone);
  const [settings] = await db.select().from(contestSettings)
    .where(eq(contestSettings.competitionId, competition.id)).limit(1);
  if (settings && !settings.remindersEnabled) return { sent: 0, skipped: 0, failed: 0 };
  const localTime = getCompetitionDateTime(now, competition.timezone).toISOString().slice(11, 16);
  const reminderTime = (settings?.reminderTime ?? "20:00:00").slice(0, 5);
  if (localTime < reminderTime) return { sent: 0, skipped: 0, failed: 0, notDue: true };
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
    const [inserted] = await db.insert(notificationLogs).values({
      competitionId: competition.id,
      userId: recipient.id,
      notificationType: "evening_reminder",
      notificationDate: today,
      status: "pending",
    }).onConflictDoNothing().returning();
    const [retryable] = inserted ? [inserted] : await db.select().from(notificationLogs).where(and(
      eq(notificationLogs.competitionId, competition.id),
      eq(notificationLogs.userId, recipient.id),
      eq(notificationLogs.notificationType, "evening_reminder"),
      eq(notificationLogs.notificationDate, today),
      or(eq(notificationLogs.status, "failed"), eq(notificationLogs.status, "pending")),
    )).limit(1);
    const log = inserted ?? retryable;
    if (!log || log.status === "sent") {
      result.skipped += 1;
      continue;
    }
    await db.update(notificationLogs).set({
      status: "pending",
      attemptCount: log.attemptCount + 1,
      lastAttemptAt: new Date(),
      errorMessage: null,
    }).where(eq(notificationLogs.id, log.id));
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
        errorMessage: null,
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
