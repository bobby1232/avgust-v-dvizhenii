import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  achievementDefinitions,
  auditLogs,
  userAchievements,
} from "@/db/schema";

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
  const restored = eligible.filter((item) =>
    existing.some((row) => row.achievementId === item.id && row.revokedAt));
  if (!fresh.length && !restored.length) return [];

  return db.transaction(async (tx) => {
    const inserted = fresh.length ? await tx.insert(userAchievements).values(fresh.map((item) => ({
      competitionId,
      userId,
      achievementId: item.id,
      source: "automatic",
    }))).onConflictDoNothing().returning({ id: userAchievements.id, achievementId: userAchievements.achievementId }) : [];
    if (restored.length) {
      await tx.update(userAchievements).set({ revokedAt: null, revokedBy: null }).where(and(
        eq(userAchievements.competitionId, competitionId),
        eq(userAchievements.userId, userId),
        inArray(userAchievements.achievementId, restored.map((item) => item.id)),
      ));
    }
    const insertedIds = new Set(inserted.map((item) => item.achievementId));
    const awarded = [
      ...fresh.filter((item) => insertedIds.has(item.id)),
      ...restored.filter((item) => !activeIds.has(item.id)),
    ];
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
  await db.update(userAchievements).set({ revokedAt: new Date(), revokedBy: revokedBy ?? null }).where(and(
    eq(userAchievements.competitionId, competitionId),
    eq(userAchievements.userId, userId),
    isNull(userAchievements.revokedAt),
    inArray(userAchievements.achievementId, unearned.map((item) => item.id)),
  ));
}
