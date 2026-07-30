import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activityDays,
  userAchievements,
  users,
  weeklyReports,
  weeklyThemes,
} from "@/db/schema";
import { activeCompetition, communityData } from "./data";
import { getCompetitionDate, shiftCompetitionDate } from "./competition-time.ts";
import { sendTelegramMessage } from "./telegram-bot";

export async function sendWeeklyReport(now = new Date()) {
  const competition = await activeCompetition();
  const reportDate = getCompetitionDate(now, competition.timezone);
  const chatId = process.env.TELEGRAM_REPORT_CHAT_ID;
  if (!chatId) throw new Error("TELEGRAM_REPORT_CHAT_ID is not configured");
  const [log] = await db.insert(weeklyReports).values({
    competitionId: competition.id,
    reportDate,
    status: "pending",
  }).onConflictDoNothing().returning();
  if (!log) return { sent: false, duplicate: true };
  const weekStart = shiftCompetitionDate(reportDate, -6);
  const [community, weekDays, todayDays, newAchievements, recipients, themes] = await Promise.all([
    communityData(),
    db.select().from(activityDays).where(and(
      eq(activityDays.competitionId, competition.id),
      gte(activityDays.activityDate, weekStart),
      lte(activityDays.activityDate, reportDate),
    )),
    db.select().from(activityDays).where(and(
      eq(activityDays.competitionId, competition.id),
      eq(activityDays.activityDate, reportDate),
    )),
    db.select().from(userAchievements).where(and(
      eq(userAchievements.competitionId, competition.id),
      isNull(userAchievements.revokedAt),
    )),
    db.select({ id: users.id }).from(users).where(eq(users.isActive, true)),
    db.select().from(weeklyThemes).where(and(
      eq(weeklyThemes.competitionId, competition.id),
      lte(weeklyThemes.startDate, reportDate),
      gte(weeklyThemes.endDate, reportDate),
    )).limit(1),
  ]);
  const achievedUsers = new Set(newAchievements.map((item) => item.userId));
  const text = [
    `📊 <b>GOSUP GAMES — отчёт за неделю</b>`,
    themes[0] ? `Тема: ${themes[0].title}` : "",
    `Остаются в игре: ${recipients.length}`,
    `Зарегистрировано: ${community.registeredParticipants}`,
    `Уникальных активных дней всего: ${community.totalActiveDays}`,
    `Активных дней за неделю: ${weekDays.length}`,
    `С активностью сегодня: ${todayDays.length}`,
    `Выдано достижений: ${newAchievements.length}`,
    `Участников с достижениями: ${achievedUsers.size}`,
  ].filter(Boolean).join("\n");
  try {
    const message = await sendTelegramMessage(chatId, text);
    await db.update(weeklyReports).set({
      status: "sent",
      sentAt: new Date(),
      telegramMessageId: String(message.message_id),
    }).where(eq(weeklyReports.id, log.id));
    return { sent: true, duplicate: false };
  } catch (error) {
    await db.update(weeklyReports).set({
      status: "failed",
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown Telegram error",
    }).where(eq(weeklyReports.id, log.id));
    throw error;
  }
}
