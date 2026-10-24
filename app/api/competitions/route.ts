import { NextResponse } from "next/server";
import { asc, desc, eq, sql } from "drizzle-orm";
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
      // Show the active contest and archives with real participation records only.
      // An empty draw must not make an otherwise empty competition visible.
      const items = await db.select().from(competitions)
        .where(sql`(
          ${competitions.isActive} = true
          OR EXISTS (SELECT 1 FROM activity_days ad WHERE ad.competition_id = ${competitions.id})
          OR EXISTS (SELECT 1 FROM activities a WHERE a.competition_id = ${competitions.id})
          OR EXISTS (
            SELECT 1 FROM draw_participants dp
            JOIN draws d ON d.id = dp.draw_id
            WHERE d.competition_id = ${competitions.id}
          )
          OR EXISTS (
            SELECT 1 FROM draw_winners dw
            JOIN draws d ON d.id = dw.draw_id
            WHERE d.competition_id = ${competitions.id}
          )
        )`)
        .orderBy(desc(competitions.startDate));
      return NextResponse.json({ competitions: items.map(item => ({ ...item, phase: competitionPhase(item) })) });
    }
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new ApiError(400, "Некорректный конкурс", "INVALID_COMPETITION");
    const [competition] = await db.select().from(competitions).where(eq(competitions.id, Number(id))).limit(1);
    if (!competition) throw new ApiError(404, "Конкурс не найден", "NOT_FOUND");
    const winners = await db.select({ drawId: draws.id, runId: draws.runId, drawnAt: draws.createdAt, position: drawWinners.position, displayName: users.displayName, department: users.department })
      .from(draws).innerJoin(drawWinners, eq(drawWinners.drawId, draws.id)).innerJoin(users, eq(users.id, drawWinners.userId))
      .where(eq(draws.competitionId, competition.id)).orderBy(desc(draws.createdAt), asc(drawWinners.position));
    return NextResponse.json({ ...await communityData(true, competition), winners });
  } catch (error) { return jsonError(error, "competitions.get"); }
}
