import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activities,
  activityDays,
  contestSettings,
  groupWorkouts,
  userAchievements,
  users,
  weeklyReports,
  weeklyThemes,
} from "@/db/schema";
import { activeCompetition, communityData } from "./data";
import { getCompetitionDate, shiftCompetitionDate } from "./competition-time";
import { sendTelegramMessage } from "./telegram-bot";

export async function sendWeeklyReport(now = new Date()) {
  const competition = await activeCompetition();
  const reportDate = getCompetitionDate(now, competition.timezone);
  const weekStart = [shiftCompetitionDate(reportDate, -6), competition.startDate].sort().at(-1)!;
  const [settings] = await db.select().from(contestSettings)
    .where(eq(contestSettings.competitionId, competition.id)).limit(1);
  if (settings && !settings.weeklyReportEnabled) return { sent: false, disabled: true };
  const chatId = settings?.reportChatId ?? process.env.TELEGRAM_REPORT_CHAT_ID;
  if (!chatId) throw new Error("Telegram report chat ID is not configured");

  const [inserted] = await db.insert(weeklyReports).values({
    competitionId: competition.id,
    reportDate,
    periodStart: weekStart,
    periodEnd: reportDate,
    status: "pending",
  }).onConflictDoNothing().returning();
  const [retryable] = inserted ? [inserted] : await db.select().from(weeklyReports).where(and(
    eq(weeklyReports.competitionId, competition.id),
    eq(weeklyReports.reportDate, reportDate),
    or(eq(weeklyReports.status, "failed"), eq(weeklyReports.status, "pending")),
  )).limit(1);
  const log = inserted ?? retryable;
  if (!log || log.status === "sent") return { sent: false, duplicate: true };
  await db.update(weeklyReports).set({
    status: "pending",
    attemptCount: log.attemptCount + 1,
    lastAttemptAt: new Date(),
    errorMessage: null,
  }).where(eq(weeklyReports.id, log.id));

  const nextDate = shiftCompetitionDate(reportDate, 1);
  const [community, weekDays, newAchievements, recipients, themes, nextThemes, workouts, stories] = await Promise.all([
    communityData(),
    db.select().from(activityDays).where(and(
      eq(activityDays.competitionId, competition.id),
      gte(activityDays.activityDate, weekStart),
      lte(activityDays.activityDate, reportDate),
    )),
    db.select().from(userAchievements).where(and(
      eq(userAchievements.competitionId, competition.id),
      gte(userAchievements.awardedAt, new Date(`${weekStart}T00:00:00+03:00`)),
      lte(userAchievements.awardedAt, new Date(`${reportDate}T23:59:59+03:00`)),
      isNull(userAchievements.revokedAt),
    )),
    db.select({ id: users.id }).from(users).where(eq(users.isActive, true)),
    db.select().from(weeklyThemes).where(and(
      eq(weeklyThemes.competitionId, competition.id),
      lte(weeklyThemes.startDate, reportDate),
      gte(weeklyThemes.endDate, reportDate),
    )).limit(1),
    db.select().from(weeklyThemes).where(and(
      eq(weeklyThemes.competitionId, competition.id),
      lte(weeklyThemes.startDate, nextDate),
      gte(weeklyThemes.endDate, nextDate),
    )).limit(1),
    db.select().from(groupWorkouts).where(and(
      eq(groupWorkouts.competitionId, competition.id),
      eq(groupWorkouts.isActive, true),
      gte(groupWorkouts.startsAt, now),
    )).limit(1),
    db.select({ description: activities.description }).from(activities).where(and(
      eq(activities.competitionId, competition.id),
      eq(activities.status, "approved"),
      gte(activities.activityDate, weekStart),
      lte(activities.activityDate, reportDate),
    )).limit(3),
  ]);
  const achievedUsers = new Set(newAchievements.map((item) => item.userId));
  const text = [
    "📊 <b>GOSUP GAMES — отчёт за неделю</b>",
    themes[0] ? `Тема: ${themes[0].title}` : "",
    `Действующих участников: ${recipients.length}`,
    `Уникальных активных дней всего: ${community.totalActiveDays}`,
    `Активных дней за неделю: ${weekDays.length}`,
    `Новых достижений: ${newAchievements.length}`,
    `Участников с новыми достижениями: ${achievedUsers.size}`,
    nextThemes[0] ? `Следующая тема: ${nextThemes[0].title}` : "",
    workouts[0]
      ? `Ближайшая общая тренировка: ${workouts[0].title}`
      : settings?.nextGroupWorkout ? `Ближайшая общая тренировка: ${settings.nextGroupWorkout}` : "",
    ...stories.filter((story) => story.description).map((story) => `💬 ${story.description}`),
  ].filter(Boolean).join("\n");
  try {
    const message = await sendTelegramMessage(chatId, text);
    await db.update(weeklyReports).set({
      status: "sent",
      sentAt: new Date(),
      telegramMessageId: String(message.message_id),
      errorMessage: null,
    }).where(eq(weeklyReports.id, log.id));
    return { sent: true, duplicate: false, periodStart: weekStart, periodEnd: reportDate };
  } catch (error) {
    await db.update(weeklyReports).set({
      status: "failed",
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown Telegram error",
    }).where(eq(weeklyReports.id, log.id));
    throw error;
  }
}
