import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { competitions, draws, drawWinners, users } from "@/db/schema";
import { requireSession, jsonError, ApiError } from "@/lib/api";
import { communityData } from "@/lib/data";
import { competitionPhase } from "@/lib/competition-time";

export async function GET(request: Request) {
  try {
    await requireSession();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      const items = await db.select().from(competitions).orderBy(desc(competitions.startDate));
      return NextResponse.json({ competitions: items.map(item => ({ ...item, phase: competitionPhase(item) })) });
    }
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new ApiError(400, "Некорректный конкурс", "INVALID_COMPETITION");
    const [competition] = await db.select().from(competitions).where(eq(competitions.id, Number(id))).limit(1);
    if (!competition) throw new ApiError(404, "Конкурс не найден", "NOT_FOUND");
    const winners = await db.select({ drawId: draws.id, runId: draws.runId, drawnAt: draws.createdAt, position: drawWinners.position, displayName: users.displayName, department: users.department })
      .from(draws).innerJoin(drawWinners, eq(drawWinners.drawId, draws.id)).innerJoin(users, eq(users.id, drawWinners.userId))
      .where(eq(draws.competitionId, competition.id)).orderBy(desc(draws.createdAt), asc(drawWinners.position));
    return NextResponse.json({ ...await communityData(competition), winners });
  } catch (error) { return jsonError(error, "competitions.get"); }
}
