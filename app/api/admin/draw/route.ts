import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { activityDays, auditLogs, drawParticipants, draws, drawWinners, users } from "@/db/schema";
import { ApiError, jsonError, requireAdmin, zodDetails } from "@/lib/api";
import { activeCompetition, registeredUser } from "@/lib/data";

const drawSchema = z.object({
  runId: z.string().trim().min(8).max(64),
  winnersCount: z.number().int().min(1).max(100),
  excludePreviousWinners: z.boolean().default(false),
  comment: z.string().trim().min(1).max(500),
});

async function responseFor(drawId: number) {
  const [draw] = await db.select().from(draws).where(eq(draws.id, drawId)).limit(1);
  const participants = await db.select({
    userId: drawParticipants.userId,
    displayName: users.displayName,
    activeDays: drawParticipants.activeDays,
  }).from(drawParticipants).innerJoin(users, eq(users.id, drawParticipants.userId))
    .where(eq(drawParticipants.drawId, drawId));
  const winners = await db.select({
    userId: drawWinners.userId,
    displayName: users.displayName,
    position: drawWinners.position,
  }).from(drawWinners).innerJoin(users, eq(users.id, drawWinners.userId))
    .where(eq(drawWinners.drawId, drawId)).orderBy(asc(drawWinners.position));
  return { draw, participants, winners };
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const parsed = drawSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, "Проверьте параметры розыгрыша", "VALIDATION_ERROR", zodDetails(parsed.error));
    const [existing] = await db.select().from(draws).where(eq(draws.runId, parsed.data.runId)).limit(1);
    if (existing) return NextResponse.json(await responseFor(existing.id));
    const competition = await activeCompetition();
    const actorUser = await registeredUser(actor.id);
    const counts = await db.select({
      userId: activityDays.userId,
      activeDays: db.$count(activityDays, and(
        eq(activityDays.competitionId, competition.id),
        eq(activityDays.userId, users.id),
      )),
    }).from(users).where(eq(users.isActive, true));
    let eligible = counts.filter((item) => item.activeDays >= 20);
    if (parsed.data.excludePreviousWinners && eligible.length) {
      const previous = await db.select({ userId: drawWinners.userId }).from(drawWinners);
      const excluded = new Set(previous.map((item) => item.userId));
      eligible = eligible.filter((item) => !excluded.has(item.userId));
    }
    if (eligible.length < parsed.data.winnersCount) {
      throw new ApiError(409, "Недостаточно допущенных участников", "NOT_ENOUGH_PARTICIPANTS");
    }
    const selected = [...eligible];
    for (let index = selected.length - 1; index > 0; index -= 1) {
      const swap = randomInt(index + 1);
      [selected[index], selected[swap]] = [selected[swap], selected[index]];
    }
    const result = await db.transaction(async (tx) => {
      const [draw] = await tx.insert(draws).values({
        competitionId: competition.id,
        runId: parsed.data.runId,
        winnersCount: parsed.data.winnersCount,
        excludePreviousWinners: parsed.data.excludePreviousWinners,
        comment: parsed.data.comment,
        createdBy: actorUser.id,
      }).returning();
      await tx.insert(drawParticipants).values(eligible.map((item) => ({
        drawId: draw.id,
        userId: item.userId,
        activeDays: item.activeDays,
      })));
      await tx.insert(drawWinners).values(selected.slice(0, parsed.data.winnersCount).map((item, index) => ({
        drawId: draw.id,
        userId: item.userId,
        position: index + 1,
      })));
      await tx.insert(auditLogs).values({
        actorTelegramId: actor.id,
        action: "draw.created",
        entityType: "draw",
        entityId: String(draw.id),
        newValue: { ...draw, eligible, winnerIds: selected.slice(0, parsed.data.winnersCount).map((item) => item.userId) },
        comment: parsed.data.comment,
      });
      return draw;
    });
    return NextResponse.json(await responseFor(result.id), { status: 201 });
  } catch (error) {
    return jsonError(error, "admin.draw.post");
  }
}
