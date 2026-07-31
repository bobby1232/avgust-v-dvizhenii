import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  achievementDefinitions,
  activities,
  auditLogs,
  userAchievements,
} from "@/db/schema";
import { eligibleActivityAchievementCodes } from "./achievement-rules";
import { enqueueAchievementEvent } from "./group-feed-outbox";

export type AwardedAchievement = {
  id: number;
  code: string;
  name: string;
  description: string;
  emoji: string;
};

export async function awardStreakAchievements(
  competitionId: number,
  userId: number,
  currentStreak: number,
): Promise<AwardedAchievement[]> {
  const definitions = await db
    .select()
    .from(achievementDefinitions)
    .where(and(
      eq(achievementDefinitions.isActive, true),
      eq(achievementDefinitions.isAutomatic, true),
      eq(achievementDefinitions.triggerType, "streak"),
    ));
  const eligible = definitions.filter((definition) =>
    definition.triggerValue !== null && currentStreak >= definition.triggerValue);
  if (!eligible.length) return [];

  const existing = await db
    .select({ id: userAchievements.id, achievementId: userAchievements.achievementId, revokedAt: userAchievements.revokedAt })
    .from(userAchievements)
    .where(and(
      eq(userAchievements.competitionId, competitionId),
      eq(userAchievements.userId, userId),
      inArray(userAchievements.achievementId, eligible.map((item) => item.id)),
    ));
  const activeIds = new Set(existing.filter((item) => !item.revokedAt).map((item) => item.achievementId));
  const existingIds = new Set(existing.map((item) => item.achievementId));
  const fresh = eligible.filter((item) => !existingIds.has(item.id));
  if (!fresh.length) return [];

  return db.transaction(async (tx) => {
    const inserted = fresh.length ? await tx.insert(userAchievements).values(fresh.map((item) => ({
      competitionId,
      userId,
      achievementId: item.id,
      source: "automatic",
    }))).onConflictDoNothing().returning({ id: userAchievements.id, achievementId: userAchievements.achievementId }) : [];
    const insertedIds = new Set(inserted.map((item) => item.achievementId));
    const awarded = fresh.filter((item) => insertedIds.has(item.id) && !activeIds.has(item.id));
    for (const row of inserted) await enqueueAchievementEvent(tx, {
      id: row.id, competitionId, userId, achievementId: row.achievementId, source: "automatic",
    });
    if (awarded.length) {
      await tx.insert(auditLogs).values(awarded.map((item) => ({
        action: "achievement.awarded",
        entityType: "user_achievement",
        entityId: String(item.id),
        payload: { competitionId, userId, achievementCode: item.code, source: "automatic" },
      })));
    }
    return awarded.map(({ id, code, name, description, emoji }) => ({ id, code, name, description, emoji }));
  });
}

export async function revokeUnearnedAutomaticAchievements(
  competitionId: number,
  userId: number,
  maxStreak: number,
  revokedBy?: number,
): Promise<void> {
  const definitions = await db.select({
    id: achievementDefinitions.id,
    triggerValue: achievementDefinitions.triggerValue,
  }).from(achievementDefinitions).where(and(
    eq(achievementDefinitions.triggerType, "streak"),
    eq(achievementDefinitions.isAutomatic, true),
    eq(achievementDefinitions.isActive, true),
  ));
  const unearned = definitions.filter((definition) =>
    definition.triggerValue !== null && definition.triggerValue > maxStreak);
  if (!unearned.length) return;
  const rows = await db.select({ id: userAchievements.id }).from(userAchievements).where(and(
    eq(userAchievements.competitionId, competitionId),
    eq(userAchievements.userId, userId),
    eq(userAchievements.source, "automatic"),
    isNull(userAchievements.revokedAt),
    inArray(userAchievements.achievementId, unearned.map((item) => item.id)),
  ));
  if (!rows.length) return;
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
      payload: { competitionId, userId, source: "automatic_recalculation" },
    })));
  });
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
  const existing = await db.select().from(userAchievements).where(and(
    eq(userAchievements.competitionId, competitionId),
    eq(userAchievements.userId, userId),
    inArray(userAchievements.achievementId, definitions.map((item) => item.id)),
  ));
  const existingIds = new Set(existing.map((item) => item.achievementId));
  const fresh = definitions.filter((item) => !existingIds.has(item.id));
  if (!fresh.length) return [];
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(userAchievements).values(fresh.map((item) => ({
      competitionId,
      userId,
      achievementId: item.id,
      source: "automatic",
    }))).onConflictDoNothing().returning();
    for (const row of inserted) await enqueueAchievementEvent(tx, {
      id: row.id, competitionId, userId, achievementId: row.achievementId, source: "automatic",
    });
    await tx.insert(auditLogs).values(inserted.map((row) => ({
      action: "achievement.awarded",
      entityType: "user_achievement",
      entityId: String(row.id),
      payload: { competitionId, userId, source: "automatic" },
    })));
    const insertedIds = new Set(inserted.map((item) => item.achievementId));
    return fresh.filter((item) => insertedIds.has(item.id))
      .map(({ id, code, name, description, emoji }) => ({ id, code, name, description, emoji }));
  });
}
