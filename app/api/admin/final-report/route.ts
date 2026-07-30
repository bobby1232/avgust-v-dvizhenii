import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/api";
import { activeCompetition, communityData } from "@/lib/data";

export async function GET() {
  try {
    await requireAdmin();
    const competition = await activeCompetition();
    const community = await communityData();
    const participants = community.participants.map((participant) => ({
      ...participant,
      eligibleForDraw: participant.isActive && participant.activeDays >= 20,
      perfectMonth: participant.activeDays === 31,
    }));
    return NextResponse.json({
      competition,
      perfectMonth: participants.filter((item) => item.perfectMonth),
      eligibleForDraw: participants.filter((item) => item.eligibleForDraw),
      participants,
      totals: {
        participants: participants.length,
        activeDays: community.totalActiveDays,
      },
    });
  } catch (error) {
    return jsonError(error, "admin.final-report");
  }
}
