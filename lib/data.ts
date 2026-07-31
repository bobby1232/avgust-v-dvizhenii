import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activities,
  activityDays,
  achievementDefinitions,
  competitions,
  userAchievements,
  users,
} from "@/db/schema";
import { ApiError } from "./api";
import { getCompetitionDate } from "./competition-time";
import { calculateProgress } from "./progress-service";

export async function activeCompetition() {
  const [competition] = await db.select().from(competitions).where(eq(competitions.isActive, true)).limit(1);
  if (!competition) throw new ApiError(409, "Активный конкурс не найден", "NO_ACTIVE_COMPETITION");
  return competition;
}

export async function registeredUser(telegramId: string) {
  const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
  if (!user) throw new ApiError(409, "Сначала пройдите регистрацию", "NOT_REGISTERED");
  return user;
}

export function favoriteActivity(
  rows: Array<{ activityType: string; customActivityName: string | null; durationMinutes: number }>,
): string | null {
  const totals = new Map<string, { count: number; duration: number }>();
  for (const row of rows) {
    const name = row.activityType === "Другое" && row.customActivityName
      ? row.customActivityName
      : row.activityType;
    const value = totals.get(name) ?? { count: 0, duration: 0 };
    value.count += 1;
    value.duration += row.durationMinutes;
    totals.set(name, value);
  }
  return [...totals].sort((a, b) =>
    b[1].count - a[1].count || b[1].duration - a[1].duration || a[0].localeCompare(b[0], "ru"))[0]?.[0] ?? null;
}

export async function userStats(userId: number, competitionId: number) {
  const [competition] = await db.select().from(competitions)
    .where(eq(competitions.id, competitionId)).limit(1);
  if (!competition) throw new ApiError(404, "Конкурс не найден", "COMPETITION_NOT_FOUND");
  const [days, approvedActivities, achievements] = await Promise.all([
    db.select({ date: activityDays.activityDate }).from(activityDays).where(and(
      eq(activityDays.userId, userId),
      eq(activityDays.competitionId, competitionId),
    )).orderBy(asc(activityDays.activityDate)),
    db.select({
      activityType: activities.activityType,
      customActivityName: activities.customActivityName,
      durationMinutes: activities.durationMinutes,
    }).from(activities).where(and(
      eq(activities.userId, userId),
      eq(activities.competitionId, competitionId),
      eq(activities.status, "approved"),
    )),
    db.select({
      id: userAchievements.id,
      code: achievementDefinitions.code,
      name: achievementDefinitions.name,
      description: achievementDefinitions.description,
      emoji: achievementDefinitions.emoji,
      awardedAt: userAchievements.awardedAt,
    }).from(userAchievements).innerJoin(
      achievementDefinitions,
      eq(userAchievements.achievementId, achievementDefinitions.id),
    ).where(and(
      eq(userAchievements.userId, userId),
      eq(userAchievements.competitionId, competitionId),
      isNull(userAchievements.revokedAt),
    )).orderBy(desc(userAchievements.awardedAt)),
  ]);
  const progress = calculateProgress(days.map((row) => row.date), competition);
  const totalDurationMinutes = approvedActivities.reduce((sum, row) => sum + row.durationMinutes, 0);
  return {
    ...progress,
    current: progress.currentStreak,
    max: progress.maxStreak,
    favoriteActivity: favoriteActivity(approvedActivities),
    totalDurationMinutes,
    achievementCount: achievements.length,
    achievements,
  };
}

export async function communityData(includeInactive = false) {
  const competition = await activeCompetition();
  const [userRows, dayRows, achievementRows] = await Promise.all([
    db.select().from(users)
      .where(includeInactive ? undefined : eq(users.isActive, true))
      .orderBy(desc(users.registeredAt)),
    db.select({ userId: activityDays.userId, date: activityDays.activityDate }).from(activityDays)
      .where(eq(activityDays.competitionId, competition.id)),
    db.select({ userId: userAchievements.userId }).from(userAchievements).where(and(
      eq(userAchievements.competitionId, competition.id),
      isNull(userAchievements.revokedAt),
    )),
  ]);
  const datesByUser = new Map<number, string[]>();
  for (const row of dayRows) datesByUser.set(row.userId, [...(datesByUser.get(row.userId) ?? []), row.date]);
  const achievementsByUser = new Map<number, number>();
  for (const row of achievementRows) achievementsByUser.set(row.userId, (achievementsByUser.get(row.userId) ?? 0) + 1);
  const participants = userRows.map((user) => {
    const progress = calculateProgress(datesByUser.get(user.id) ?? [], competition);
    return {
      id: user.id,
      displayName: user.displayName,
      telegramUsername: user.telegramUsername,
      department: user.department,
      registeredAt: user.registeredAt,
      isActive: user.isActive,
      notificationsEnabled: user.notificationsEnabled,
      ...progress,
      current: progress.currentStreak,
      max: progress.maxStreak,
      achievementCount: achievementsByUser.get(user.id) ?? 0,
    };
  }).sort((a, b) =>
    b.activeDays - a.activeDays ||
    b.currentStreak - a.currentStreak ||
    a.displayName.localeCompare(b.displayName, "ru"));
  return {
    competition,
    registeredParticipants: participants.length,
    activeParticipants: participants.filter((participant) => participant.activeDays > 0).length,
    totalActiveDays: participants.reduce((sum, participant) => sum + participant.activeDays, 0),
    participants,
  };
}

export async function adminStats() {
  const community = await communityData();
  const today = getCompetitionDate(new Date(), community.competition.timezone);
  const [todayRows, allRows] = await Promise.all([
    db.select({ id: activityDays.id }).from(activityDays).where(and(
      eq(activityDays.competitionId, community.competition.id),
      eq(activityDays.activityDate, today),
    )),
    db.select({ id: activities.id }).from(activities).where(eq(activities.competitionId, community.competition.id)),
  ]);
  return {
    totalRegistrations: community.registeredParticipants,
    activeParticipants: community.activeParticipants,
    checkinsToday: todayRows.length,
    totalActivities: allRows.length,
  };
}
