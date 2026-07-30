import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/api";
import { activeCompetition, registeredUser, userStats } from "@/lib/data";

export async function GET() {
  try {
    const session = await requireSession();
    const [competition, user] = await Promise.all([
      activeCompetition(),
      registeredUser(session.id),
    ]);
    const stats = await userStats(user.id, competition.id);
    return NextResponse.json({ achievements: stats.achievements });
  } catch (error) {
    return jsonError(error, "achievements");
  }
}
