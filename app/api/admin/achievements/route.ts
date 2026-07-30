import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { achievementDefinitions, auditLogs, userAchievements, users } from "@/db/schema";
import { ApiError, jsonError, requireAdmin, zodDetails } from "@/lib/api";
import { activeCompetition, registeredUser } from "@/lib/data";

const changeSchema = z.object({
  userId: z.number().int().positive(),
  achievementId: z.number().int().positive(),
  action: z.enum(["award", "revoke"]),
  comment: z.string().trim().min(1, "Комментарий обязателен").max(500),
});

export async function GET() {
  try {
    await requireAdmin();
    const competition = await activeCompetition();
    const [definitions, awards] = await Promise.all([
      db.select().from(achievementDefinitions).orderBy(achievementDefinitions.id),
      db.select({
        id: userAchievements.id,
        userId: userAchievements.userId,
        participant: users.displayName,
        achievementId: userAchievements.achievementId,
        source: userAchievements.source,
        awardedAt: userAchievements.awardedAt,
        revokedAt: userAchievements.revokedAt,
        comment: userAchievements.comment,
      }).from(userAchievements).innerJoin(users, eq(users.id, userAchievements.userId))
        .where(eq(userAchievements.competitionId, competition.id))
        .orderBy(desc(userAchievements.awardedAt)),
    ]);
    return NextResponse.json({ definitions, awards });
  } catch (error) {
    return jsonError(error, "admin.achievements.get");
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const parsed = changeSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError(400, "Проверьте данные достижения", "VALIDATION_ERROR", zodDetails(parsed.error));
    }
    const competition = await activeCompetition();
    const actorUser = await registeredUser(actor.id);
    const [definition] = await db.select().from(achievementDefinitions)
      .where(eq(achievementDefinitions.id, parsed.data.achievementId)).limit(1);
    if (!definition) throw new ApiError(404, "Достижение не найдено", "ACHIEVEMENT_NOT_FOUND");
    const [existing] = await db.select().from(userAchievements).where(and(
      eq(userAchievements.competitionId, competition.id),
      eq(userAchievements.userId, parsed.data.userId),
      eq(userAchievements.achievementId, parsed.data.achievementId),
    )).limit(1);

    const result = await db.transaction(async (tx) => {
      if (parsed.data.action === "award") {
        const [row] = existing
          ? await tx.update(userAchievements).set({
            revokedAt: null,
            revokedBy: null,
            revocationSource: null,
            source: "manual",
            awardedBy: actorUser.id,
            awardedAt: new Date(),
            comment: parsed.data.comment,
          }).where(eq(userAchievements.id, existing.id)).returning()
          : await tx.insert(userAchievements).values({
            competitionId: competition.id,
            userId: parsed.data.userId,
            achievementId: definition.id,
            source: "manual",
            awardedBy: actorUser.id,
            comment: parsed.data.comment,
          }).returning();
        await tx.insert(auditLogs).values({
          actorTelegramId: actor.id,
          action: "admin.achievement.awarded",
          entityType: "user_achievement",
          entityId: String(row.id),
          oldValue: existing ?? null,
          newValue: row,
          comment: parsed.data.comment,
        });
        return row;
      }
      if (!existing || existing.revokedAt) throw new ApiError(409, "Активного достижения нет", "ACHIEVEMENT_NOT_ACTIVE");
      const [row] = await tx.update(userAchievements).set({
        revokedAt: new Date(),
        revokedBy: actorUser.id,
        revocationSource: "manual",
        comment: parsed.data.comment,
      }).where(and(eq(userAchievements.id, existing.id), isNull(userAchievements.revokedAt))).returning();
      await tx.insert(auditLogs).values({
        actorTelegramId: actor.id,
        action: "admin.achievement.revoked",
        entityType: "user_achievement",
        entityId: String(row.id),
        oldValue: existing,
        newValue: row,
        comment: parsed.data.comment,
      });
      return row;
    });
    return NextResponse.json({ achievement: result });
  } catch (error) {
    return jsonError(error, "admin.achievements.post");
  }
}
