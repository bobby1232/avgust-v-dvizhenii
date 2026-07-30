import { NextResponse } from "next/server";
import { getPool } from "@/db/client";

export const dynamic = "force-dynamic";

type CheckResult = {
  ok: boolean;
  rows?: Array<Record<string, unknown>>;
  error?: string;
};

function connectionTarget() {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return {
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.replace(/^\//, ""),
    };
  } catch {
    return { host: "invalid", port: "", database: "" };
  }
}

async function runCheck(sql: string, values: unknown[] = []): Promise<CheckResult> {
  try {
    const result = await getPool().query(sql, values);
    return { ok: true, rows: result.rows };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}

export async function GET() {
  const connection = await runCheck(`
    SELECT current_database() AS database,
           current_user AS database_user,
           version() AS postgres_version
  `);

  const readiness = await runCheck(`
    SELECT
      to_regclass('public.competitions')::text AS competitions,
      to_regclass('public.users')::text AS users,
      to_regclass('public.activities')::text AS activities,
      to_regclass('public.activity_days')::text AS activity_days,
      to_regclass('public.achievement_definitions')::text AS achievement_definitions,
      to_regclass('public.user_achievements')::text AS user_achievements,
      to_regclass('public.contest_settings')::text AS contest_settings,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'duration_minutes'
      ) AS activities_duration_minutes,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'status'
      ) AS activities_status,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'notifications_enabled'
      ) AS users_notifications_enabled
  `);

  const activeCompetition = await runCheck(`
    SELECT id, name, start_date, end_date, timezone, is_active
    FROM competitions
    WHERE is_active = true
    ORDER BY id
  `);

  const counts = await runCheck(`
    SELECT
      (SELECT count(*)::int FROM competitions) AS competitions,
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM activities) AS activities,
      (SELECT count(*)::int FROM activity_days) AS activity_days,
      (SELECT count(*)::int FROM achievement_definitions) AS achievement_definitions,
      (SELECT count(*)::int FROM user_achievements) AS user_achievements,
      (SELECT count(*)::int FROM contest_settings) AS contest_settings
  `);

  const firstUser = await runCheck(`
    SELECT id, telegram_id, display_name, is_active
    FROM users
    ORDER BY id
    LIMIT 1
  `);

  const firstUserId = firstUser.ok && firstUser.rows?.[0]?.id
    ? Number(firstUser.rows[0].id)
    : null;
  const competitionId = activeCompetition.ok && activeCompetition.rows?.length === 1
    ? Number(activeCompetition.rows[0].id)
    : null;

  const startupQueries: Record<string, CheckResult> = {};
  if (firstUserId && competitionId) {
    startupQueries.activityDays = await runCheck(`
      SELECT activity_date
      FROM activity_days
      WHERE user_id = $1 AND competition_id = $2
      ORDER BY activity_date
    `, [firstUserId, competitionId]);

    startupQueries.approvedActivities = await runCheck(`
      SELECT activity_type, custom_activity_name, duration_minutes
      FROM activities
      WHERE user_id = $1 AND competition_id = $2 AND status = 'approved'
    `, [firstUserId, competitionId]);

    startupQueries.achievements = await runCheck(`
      SELECT ua.id, ad.code, ad.name, ad.description, ad.emoji, ua.awarded_at
      FROM user_achievements ua
      INNER JOIN achievement_definitions ad ON ad.id = ua.achievement_id
      WHERE ua.user_id = $1 AND ua.competition_id = $2 AND ua.revoked_at IS NULL
      ORDER BY ua.awarded_at DESC
    `, [firstUserId, competitionId]);
  }

  const checks = {
    connection,
    readiness,
    activeCompetition,
    counts,
    firstUser: firstUser.ok
      ? { ok: true, exists: Boolean(firstUser.rows?.length) }
      : firstUser,
    startupQueries,
  };

  const ok = connection.ok
    && readiness.ok
    && activeCompetition.ok
    && activeCompetition.rows?.length === 1
    && counts.ok
    && Object.values(startupQueries).every((item) => item.ok);

  return NextResponse.json({
    status: ok ? "ok" : "failed",
    target: connectionTarget(),
    checks,
  }, { status: ok ? 200 : 503 });
}
