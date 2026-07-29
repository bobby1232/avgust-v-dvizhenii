import { NextRequest } from "next/server";
import { databaseErrorResponse, ensureSchema, getSql, moscowDateString } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParticipantRow = {
  id: string;
  name: string;
  telegram_username: string | null;
  activity_dates: string[];
};

type ActivityRow = {
  id: string;
  activity_type: string;
  note: string | null;
  activity_date: string;
  created_at: Date;
};

function ordinal(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function calculateStreaks(dates: string[], today: string) {
  const sorted = [...new Set(dates)].sort();
  const ordinals = new Set(sorted.map(ordinal));
  let cursor = ordinal(today);

  if (!ordinals.has(cursor)) cursor -= 1;

  let current = 0;
  while (ordinals.has(cursor)) {
    current += 1;
    cursor -= 1;
  }

  let maximum = 0;
  let running = 0;
  let previous: number | null = null;

  for (const value of sorted.map(ordinal)) {
    running = previous !== null && value === previous + 1 ? running + 1 : 1;
    maximum = Math.max(maximum, running);
    previous = value;
  }

  return { current, maximum };
}

function serializeParticipant(row: ParticipantRow, today: string) {
  const activityDates = row.activity_dates ?? [];
  const streaks = calculateStreaks(activityDates, today);

  return {
    id: row.id,
    name: row.name,
    telegramUsername: row.telegram_username,
    activeDays: activityDates.length,
    streak: streaks.current,
    maxStreak: streaks.maximum,
    activityDates,
  };
}

export async function GET(request: NextRequest) {
  try {
    await ensureSchema();
    const sql = getSql();
    const today = moscowDateString();
    const participantId = request.nextUrl.searchParams.get("participantId")?.trim() || null;

    const participantRows = await sql<ParticipantRow[]>`
      SELECT
        p.id,
        p.name,
        p.telegram_username,
        COALESCE(
          ARRAY_AGG(a.activity_date::TEXT ORDER BY a.activity_date)
            FILTER (WHERE a.id IS NOT NULL),
          ARRAY[]::TEXT[]
        ) AS activity_dates
      FROM participants p
      LEFT JOIN activities a ON a.participant_id = p.id
      GROUP BY p.id
      ORDER BY COUNT(a.id) DESC, p.created_at ASC
      LIMIT 200
    `;

    const participants = participantRows.map((row) => serializeParticipant(row, today));
    const participant = participantId
      ? participants.find((item) => item.id === participantId) ?? null
      : null;

    const [stats] = await sql<
      { total_participants: number; total_days: number; today_checkins: number }[]
    >`
      SELECT
        (SELECT COUNT(*)::INT FROM participants) AS total_participants,
        (SELECT COUNT(*)::INT FROM activities) AS total_days,
        (
          SELECT COUNT(*)::INT
          FROM activities
          WHERE activity_date = ${today}::DATE
        ) AS today_checkins
    `;

    let recentActivities: ActivityRow[] = [];
    if (participant) {
      recentActivities = await sql<ActivityRow[]>`
        SELECT
          id::TEXT,
          activity_type,
          note,
          activity_date::TEXT,
          created_at
        FROM activities
        WHERE participant_id = ${participant.id}
        ORDER BY activity_date DESC, created_at DESC
        LIMIT 20
      `;
    }

    return Response.json({
      today,
      participant,
      participants,
      recentActivities: recentActivities.map((item) => ({
        id: item.id,
        activityType: item.activity_type,
        note: item.note,
        activityDate: item.activity_date,
        createdAt: item.created_at,
      })),
      stats: {
        totalParticipants: stats?.total_participants ?? 0,
        totalDays: stats?.total_days ?? 0,
        todayCheckins: stats?.today_checkins ?? 0,
      },
    });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
