import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  achievementDefinitions,
  activities,
  auditLogs,
  competitions,
  userAchievements,
} from "@/db/schema";
import {
  automaticActivityAchievementCodes,
  eligibleActivityAchievementCodes,
} from "./achievement-rules";
import { enqueueAchievementEvent } from "./group-feed-outbox";

export type AwardedAchievement = {
  id: number;
  code: string;
  name: string;
  description: string;
  emoji: string;
};

type AchievementDefinition = typeof achievementDefinitions.$inferSelect;

function publicAchievement(definition: AchievementDefinition): AwardedAchievement {
  const { id, code, name, description, emoji } = definition;
  return { id, code, name, description, emoji };
}

async function awardEligibleDefinitions(
  competitionId: number,
  userId: number,
  eligible: AchievementDefinition[],
): Promise<AwardedAchievement[]> {
  if (!eligible.length) return [];

  const existing = await db.select().from(userAchievements).where(and(
    eq(userAchievements.competitionId, competitionId),
    eq(userAchievements.userId, userId),
    inArray(userAchievements.achievementId, eligible.map((item) => item.id)),
  ));
  const existingByAchievementId = new Map(existing.map((item) => [item.achievementId, item]));
  const fresh = eligible.filter((item) => !existingByAchievementId.has(item.id));
  const revoked = eligible
    .map((item) => ({ definition: item, award: existingByAchievementId.get(item.id) }))
    .filter((item): item is { definition: AchievementDefinition; award: typeof existing[number] } =>
      Boolean(item.award?.revokedAt));
  if (!fresh.length && !revoked.length) return [];

  return db.transaction(async (tx) => {
    const inserted = fresh.length
      ? await tx.insert(userAchievements).values(fresh.map((item) => ({
        competitionId,
        userId,
        achievementId: item.id,
        source: "automatic",
      }))).onConflictDoNothing().returning({
        id: userAchievements.id,
        achievementId: userAchievements.achievementId,
        awardedAt: userAchievements.awardedAt,
      })
      : [];

    const reactivated = revoked.length
      ? await tx.update(userAchievements).set({
        source: "automatic",
        awardedAt: new Date(),
        awardedBy: null,
        revokedAt: null,
        revokedBy: null,
        revocationSource: null,
        comment: null,
      }).where(inArray(userAchievements.id, revoked.map((item) => item.award.id))).returning({
        id: userAchievements.id,
        achievementId: userAchievements.achievementId,
        awardedAt: userAchievements.awardedAt,
      })
      : [];

    const awardedRows = [...inserted, ...reactivated];
    if (!awardedRows.length) return [];
    const definitionById = new Map(eligible.map((item) => [item.id, item]));

    for (const row of awardedRows) {
      await enqueueAchievementEvent(tx, {
        id: row.id,
        competitionId,
        userId,
        achievementId: row.achievementId,
        source: "automatic",
        eventVersion: row.awardedAt.toISOString(),
      });
    }

    await tx.insert(auditLogs).values(awardedRows.map((row) => ({
      action: "achievement.awarded",
      entityType: "user_achievement",
      entityId: String(row.id),
      payload: {
        competitionId,
        userId,
        achievementCode: definitionById.get(row.achievementId)?.code,
        source: "automatic",
        reactivated: reactivated.some((item) => item.id === row.id),
      },
    })));

    return awardedRows
      .map((row) => definitionById.get(row.achievementId))
      .filter((item): item is AchievementDefinition => Boolean(item))
      .map(publicAchievement);
  });
}

export async function awardStreakAchievements(
  competitionId: number,
  userId: number,
  currentStreak: number,
): Promise<AwardedAchievement[]> {
  const definitions = await db.select().from(achievementDefinitions).where(and(
    eq(achievementDefinitions.isActive, true),
    eq(achievementDefinitions.isAutomatic, true),
    eq(achievementDefinitions.triggerType, "streak"),
  ));
  const eligible = definitions.filter((definition) =>
    definition.triggerValue !== null && currentStreak >= definition.triggerValue);
  return awardEligibleDefinitions(competitionId, userId, eligible);
}

export async function awardActivityAchievements(
  competitionId: number,
  userId: number,
  competitionStart: string,
  timezone: string,
): Promise<AwardedAchievement[]> {
  const rows = await db.select({
    activityDate: activities.activityDate,
    activityType: activities.activityType,
    createdAt: activities.createdAt,
  }).from(activities).where(and(
    eq(activities.competitionId, competitionId),
    eq(activities.userId, userId),
    eq(activities.status, "approved"),
  ));
  const codes = eligibleActivityAchievementCodes(rows, competitionStart, timezone);
  if (!codes.length) return [];
  const definitions = await db.select().from(achievementDefinitions).where(and(
    inArray(achievementDefinitions.code, codes),
    eq(achievementDefinitions.isAutomatic, true),
    eq(achievementDefinitions.isActive, true),
  ));
  return awardEligibleDefinitions(competitionId, userId, definitions);
}

export async function revokeUnearnedAutomaticAchievements(
  competitionId: number,
  userId: number,
  maxStreak: number,
  revokedBy?: number,
): Promise<void> {
  const [competition] = await db.select({
    startDate: competitions.startDate,
    timezone: competitions.timezone,
  }).from(competitions).where(eq(competitions.id, competitionId)).limit(1);
  if (!competition) return;

  const activityRows = await db.select({
    activityDate: activities.activityDate,
    activityType: activities.activityType,
    createdAt: activities.createdAt,
  }).from(activities).where(and(
    eq(activities.competitionId, competitionId),
    eq(activities.userId, userId),
    eq(activities.status, "approved"),
  ));
  const earnedActivityCodes = new Set(eligibleActivityAchievementCodes(
    activityRows,
    competition.startDate,
    competition.timezone,
  ));
  const managedActivityCodes = new Set<string>(automaticActivityAchievementCodes);

  const definitions = await db.select().from(achievementDefinitions).where(and(
    eq(achievementDefinitions.isAutomatic, true),
    eq(achievementDefinitions.isActive, true),
  ));
  const unearned = definitions.filter((definition) => {
    if (definition.triggerType === "streak") {
      return definition.triggerValue !== null && definition.triggerValue > maxStreak;
    }
    return managedActivityCodes.has(definition.code) && !earnedActivityCodes.has(definition.code);
  });
  if (!unearned.length) return;

  const rows = await db.select({
    id: userAchievements.id,
    achievementId: userAchievements.achievementId,
  }).from(userAchievements).where(and(
    eq(userAchievements.competitionId, competitionId),
    eq(userAchievements.userId, userId),
    eq(userAchievements.source, "automatic"),
    isNull(userAchievements.revokedAt),
    inArray(userAchievements.achievementId, unearned.map((item) => item.id)),
  ));
  if (!rows.length) return;

  const definitionById = new Map(unearned.map((item) => [item.id, item]));
  await db.transaction(async (tx) => {
    await tx.update(userAchievements).set({
      revokedAt: new Date(),
      revokedBy: revokedBy ?? null,
      revocationSource: "automatic_recalculation",
    }).where(inArray(userAchievements.id, rows.map((row) => row.id)));
    await tx.insert(auditLogs).values(rows.map((row) => ({
      action: "achievement.revoked",
      entityType: "user_achievement",
      entityId: String(row.id),
      payload: {
        competitionId,
        userId,
        achievementCode: definitionById.get(row.achievementId)?.code,
        source: "automatic_recalculation",
      },
    })));
  });
}
