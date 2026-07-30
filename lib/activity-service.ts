import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activities,
  activityDays,
  activityTypes,
  auditLogs,
  users,
} from "@/db/schema";
import { ApiError } from "./api";
import {
  competitionPhase,
  getCompetitionDate,
  isCompetitionDay,
} from "./competition-time";
import { calculateProgress } from "./progress-service";
import {
  awardActivityAchievements,
  awardStreakAchievements,
  revokeUnearnedAutomaticAchievements,
} from "./achievement-service";

type User = typeof users.$inferSelect;
type Competition = {
  id: number;
  startDate: string;
  endDate: string | null;
  timezone: string;
};
type ActivityInput = {
  activityType: string;
  customActivityName?: string;
  durationMinutes: number;
  description?: string;
};

export async function assertActiveActivityType(activityType: string) {
  const [knownType] = await db.select({ id: activityTypes.id }).from(activityTypes)
    .where(and(eq(activityTypes.name, activityType), eq(activityTypes.isActive, true))).limit(1);
  if (!knownType) throw new ApiError(400, "Выберите вид активности из справочника", "UNKNOWN_ACTIVITY_TYPE");
}

export async function createParticipantActivity(
  user: User,
  competition: Competition,
  input: ActivityInput,
  actorTelegramId: string,
) {
  if (!user.isActive) throw new ApiError(403, "Ваш профиль отключён администратором", "USER_DISABLED");
  if (competitionPhase(competition) !== "active") {
    throw new ApiError(409,
      competitionPhase(competition) === "before" ? "Игра начнётся 1 августа." : "Игра завершена. Посмотрите свои итоги.",
      "COMPETITION_NOT_ACTIVE");
  }
  const activityDate = getCompetitionDate(new Date(), competition.timezone);
  if (!isCompetitionDay(activityDate, competition)) {
    throw new ApiError(409, "Текущий день находится за пределами конкурса", "OUTSIDE_COMPETITION");
  }
  await assertActiveActivityType(input.activityType);

  const [[{ value: dailyCount }], created] = await db.transaction(async (tx) => {
    const counts = await tx.select({ value: count() }).from(activities).where(and(
      eq(activities.competitionId, competition.id),
      eq(activities.userId, user.id),
      eq(activities.activityDate, activityDate),
    ));
    if (counts[0].value >= 10) {
      throw new ApiError(429, "За день можно сохранить не более 10 активностей", "DAILY_ACTIVITY_LIMIT");
    }
    const [activity] = await tx.insert(activities).values({
      competitionId: competition.id,
      userId: user.id,
      activityDate,
      activityType: input.activityType,
      customActivityName: input.customActivityName || null,
      durationMinutes: input.durationMinutes,
      description: input.description || null,
      status: "approved",
      createdBy: user.id,
      updatedBy: user.id,
    }).returning();
    await tx.insert(activityDays).values({
      competitionId: competition.id,
      userId: user.id,
      activityDate,
      firstActivityId: activity.id,
    }).onConflictDoNothing();
    await tx.insert(auditLogs).values({
      actorTelegramId,
      action: "activity.created",
      entityType: "activity",
      entityId: String(activity.id),
      newValue: { activityDate, activityType: input.activityType, durationMinutes: input.durationMinutes },
    });
    return [counts, activity] as const;
  });

  const dates = await db.select({ date: activityDays.activityDate }).from(activityDays).where(and(
    eq(activityDays.competitionId, competition.id),
    eq(activityDays.userId, user.id),
  )).orderBy(asc(activityDays.activityDate));
  const progress = calculateProgress(dates.map((item) => item.date), competition);
  const awardedAchievements = await awardStreakAchievements(
    competition.id,
    user.id,
    progress.maxStreak,
  );
  const activityAchievements = await awardActivityAchievements(
    competition.id, user.id, competition.startDate, competition.timezone);
  return {
    activity: created,
    progress,
    awardedAchievements: [...awardedAchievements, ...activityAchievements],
    dailyCount: dailyCount + 1,
  };
}

export async function rebuildActivityDayAndAchievements(
  competition: Competition,
  userId: number,
  activityDate: string,
  actorUserId?: number,
) {
  const approved = await db.select({ id: activities.id }).from(activities).where(and(
    eq(activities.competitionId, competition.id),
    eq(activities.userId, userId),
    eq(activities.activityDate, activityDate),
    eq(activities.status, "approved"),
  )).orderBy(asc(activities.createdAt));
  if (approved.length) {
    await db.insert(activityDays).values({
      competitionId: competition.id,
      userId,
      activityDate,
      firstActivityId: approved[0].id,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [activityDays.competitionId, activityDays.userId, activityDays.activityDate],
      set: { firstActivityId: approved[0].id, updatedAt: new Date() },
    });
  } else {
    await db.delete(activityDays).where(and(
      eq(activityDays.competitionId, competition.id),
      eq(activityDays.userId, userId),
      eq(activityDays.activityDate, activityDate),
    ));
  }
  const dates = await db.select({ date: activityDays.activityDate }).from(activityDays).where(and(
    eq(activityDays.competitionId, competition.id),
    eq(activityDays.userId, userId),
  ));
  const progress = calculateProgress(dates.map((item) => item.date), competition);
  const awardedAchievements = await awardStreakAchievements(competition.id, userId, progress.maxStreak);
  const activityAchievements = await awardActivityAchievements(
    competition.id, userId, competition.startDate, competition.timezone);
  await revokeUnearnedAutomaticAchievements(competition.id, userId, progress.maxStreak, actorUserId);
  return { progress, awardedAchievements: [...awardedAchievements, ...activityAchievements] };
}
