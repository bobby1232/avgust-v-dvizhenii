import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ReadinessRow = {
  activity_days: string | null;
  achievement_definitions: string | null;
  contest_settings: string | null;
  activities_duration_minutes: boolean;
  users_notifications_enabled: boolean;
};

export async function GET() {
  try {
    const { getPool } = await import("@/db/client");
    const result = await getPool().query<ReadinessRow>(`
      SELECT
        to_regclass('public.activity_days')::text AS activity_days,
        to_regclass('public.achievement_definitions')::text AS achievement_definitions,
        to_regclass('public.contest_settings')::text AS contest_settings,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'activities'
            AND column_name = 'duration_minutes'
        ) AS activities_duration_minutes,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'users'
            AND column_name = 'notifications_enabled'
        ) AS users_notifications_enabled
    `);

    const readiness = result.rows[0];
    const missing = readiness
      ? Object.entries(readiness)
        .filter(([, value]) => value === null || value === false)
        .map(([name]) => name)
      : ["readiness_result"];

    if (missing.length > 0) {
      throw new Error(`Database schema is incomplete: ${missing.join(", ")}`);
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error(
      "[health] Database or schema unavailable",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
