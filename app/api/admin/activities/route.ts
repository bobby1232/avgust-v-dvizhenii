import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { activities, auditLogs, users } from "@/db/schema";
import { ApiError, jsonError, requireAdmin } from "@/lib/api";
import { activeCompetition, registeredUser } from "@/lib/data";
import { isCompetitionDay } from "@/lib/competition-time";
import { rebuildActivityDayAndAchievements } from "@/lib/activity-service";
import { adminActivityPatchSchema, adminActivitySchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireAdmin();
    const competition = await activeCompetition();
    const rows = await db.select({
      activity: activities,
      participant: users.displayName,
    }).from(activities).innerJoin(users, eq(activities.userId, users.id))
      .where(eq(activities.competitionId, competition.id))
      .orderBy(desc(activities.activityDate), desc(activities.createdAt));
    return NextResponse.json({ activities: rows });
  } catch (error) {
    return jsonError(error, "admin.activities.get");
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const parsed = adminActivitySchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, "Проверьте данные активности", "VALIDATION_ERROR");
    const competition = await activeCompetition();
    if (!isCompetitionDay(parsed.data.activityDate, competition)) {
      throw new ApiError(400, "Дата находится за пределами конкурса", "OUTSIDE_COMPETITION");
    }
    const actorUser = await registeredUser(actor.id);
    const [target] = await db.select().from(users).where(eq(users.id, parsed.data.userId)).limit(1);
    if (!target) throw new ApiError(404, "Участник не найден", "USER_NOT_FOUND");
    const [activity] = await db.insert(activities).values({
      competitionId: competition.id,
      userId: target.id,
      activityDate: parsed.data.activityDate,
      activityType: parsed.data.activityType,
      customActivityName: parsed.data.customActivityName || null,
      durationMinutes: parsed.data.durationMinutes,
      description: parsed.data.description || null,
      status: parsed.data.status,
      createdBy: actorUser.id,
      updatedBy: actorUser.id,
    }).returning();
    await db.insert(auditLogs).values({
      actorTelegramId: actor.id,
      action: "admin.activity.created",
      entityType: "activity",
      entityId: String(activity.id),
      newValue: activity,
      comment: parsed.data.comment || null,
    });
    const recalculation = await rebuildActivityDayAndAchievements(
      competition, target.id, activity.activityDate, actorUser.id);
    return NextResponse.json({ activity, ...recalculation }, { status: 201 });
  } catch (error) {
    return jsonError(error, "admin.activities.post");
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireAdmin();
    const parsed = adminActivityPatchSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, "Проверьте данные активности", "VALIDATION_ERROR");
    const competition = await activeCompetition();
    const actorUser = await registeredUser(actor.id);
    const [previous] = await db.select().from(activities).where(and(
      eq(activities.id, parsed.data.id),
      eq(activities.competitionId, competition.id),
    )).limit(1);
    if (!previous) throw new ApiError(404, "Активность не найдена", "ACTIVITY_NOT_FOUND");
    if (parsed.data.activityDate && !isCompetitionDay(parsed.data.activityDate, competition)) {
      throw new ApiError(400, "Дата находится за пределами конкурса", "OUTSIDE_COMPETITION");
    }
    const { id, comment, ...changes } = parsed.data;
    const values = {
      ...changes,
      customActivityName: changes.customActivityName || undefined,
      description: changes.description || undefined,
      updatedBy: actorUser.id,
      updatedAt: new Date(),
    };
    const [activity] = await db.update(activities).set(values).where(eq(activities.id, id)).returning();
    await db.insert(auditLogs).values({
      actorTelegramId: actor.id,
      action: "admin.activity.updated",
      entityType: "activity",
      entityId: String(id),
      oldValue: previous,
      newValue: activity,
      comment: comment || null,
    });
    await rebuildActivityDayAndAchievements(competition, previous.userId, previous.activityDate, actorUser.id);
    const recalculation = await rebuildActivityDayAndAchievements(
      competition, activity.userId, activity.activityDate, actorUser.id);
    return NextResponse.json({ activity, ...recalculation });
  } catch (error) {
    return jsonError(error, "admin.activities.patch");
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireAdmin();
    const body = await request.json() as { id?: unknown; comment?: unknown };
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Некорректный ID", "VALIDATION_ERROR");
    const competition = await activeCompetition();
    const actorUser = await registeredUser(actor.id);
    const [previous] = await db.select().from(activities).where(and(
      eq(activities.id, id),
      eq(activities.competitionId, competition.id),
    )).limit(1);
    if (!previous) throw new ApiError(404, "Активность не найдена", "ACTIVITY_NOT_FOUND");
    await db.transaction(async (tx) => {
      await tx.delete(activities).where(eq(activities.id, id));
      await tx.insert(auditLogs).values({
        actorTelegramId: actor.id,
        action: "admin.activity.deleted",
        entityType: "activity",
        entityId: String(id),
        oldValue: previous,
        comment: typeof body.comment === "string" ? body.comment.slice(0, 500) : null,
      });
    });
    const recalculation = await rebuildActivityDayAndAchievements(
      competition, previous.userId, previous.activityDate, actorUser.id);
    return NextResponse.json({ deleted: true, ...recalculation });
  } catch (error) {
    return jsonError(error, "admin.activities.delete");
  }
}
