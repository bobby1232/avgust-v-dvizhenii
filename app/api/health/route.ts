import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ReadinessRow = {
  competitions: string | null;
  users: string | null;
  activities: string | null;
  activity_days: string | null;
  achievement_definitions: string | null;
  user_achievements: string | null;
  contest_settings: string | null;
  group_feed_events: string | null;
  activities_duration_minutes: boolean;
  activities_status: boolean;
  users_notifications_enabled: boolean;
  contest_settings_group_feed_enabled: boolean;
  contest_settings_activity_digest_interval_minutes: boolean;
};

type FeedSettingsRow = {
  chat_configured: boolean;
  group_feed_enabled: boolean;
  activity_digest_enabled: boolean;
  activity_digest_interval_minutes: number;
  achievement_announcements_enabled: boolean;
  leaderboard_announcements_enabled: boolean;
  daily_summary_enabled: boolean;
};

type FeedCountRow = {
  event_type: string;
  status: string;
  count: number;
};

type FeedEventRow = {
  event_type: string;
  status: string;
  attempt_count: number;
  error_message: string | null;
  created_at: Date;
  last_attempt_at: Date | null;
  available_at: Date;
};

function sanitizeError(value: string | null) {
  if (!value) return null;
  return value
    .replace(/bot\d+:[^/\s]+/gi, "bot[redacted]")
    .replace(/-100\d+/g, "[chat-id]")
    .slice(0, 300);
}

export async function GET() {
  try {
    const { getPool } = await import("@/db/client");
    const pool = getPool();

    const readinessResult = await pool.query<ReadinessRow>(`
      SELECT
        to_regclass('public.competitions')::text AS competitions,
        to_regclass('public.users')::text AS users,
        to_regclass('public.activities')::text AS activities,
        to_regclass('public.activity_days')::text AS activity_days,
        to_regclass('public.achievement_definitions')::text AS achievement_definitions,
        to_regclass('public.user_achievements')::text AS user_achievements,
        to_regclass('public.contest_settings')::text AS contest_settings,
        to_regclass('public.group_feed_events')::text AS group_feed_events,
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
            AND table_name = 'activities'
            AND column_name = 'status'
        ) AS activities_status,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'users'
            AND column_name = 'notifications_enabled'
        ) AS users_notifications_enabled,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'contest_settings'
            AND column_name = 'group_feed_enabled'
        ) AS contest_settings_group_feed_enabled,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'contest_settings'
            AND column_name = 'activity_digest_interval_minutes'
        ) AS contest_settings_activity_digest_interval_minutes
    `);

    const readiness = readinessResult.rows[0];
    const missing = readiness
      ? Object.entries(readiness)
        .filter(([, value]) => value === null || value === false)
        .map(([name]) => name)
      : ["readiness_result"];

    if (missing.length > 0) {
      throw new Error(`Database schema is incomplete: ${missing.join(", ")}`);
    }

    const competitionResult = await pool.query<{ id: string }>(`
      SELECT id
      FROM competitions
      WHERE is_active = true
      ORDER BY id
    `);
    if (competitionResult.rows.length !== 1) {
      throw new Error(`Expected exactly one active competition, found ${competitionResult.rows.length}`);
    }

    const competitionId = competitionResult.rows[0].id;
    const userResult = await pool.query<{ id: string }>(`
      SELECT id
      FROM users
      ORDER BY id
      LIMIT 1
    `);

    if (userResult.rows[0]) {
      const userId = userResult.rows[0].id;
      await Promise.all([
        pool.query(`
          SELECT activity_date
          FROM activity_days
          WHERE user_id = $1 AND competition_id = $2
          ORDER BY activity_date
        `, [userId, competitionId]),
        pool.query(`
          SELECT activity_type, custom_activity_name, duration_minutes
          FROM activities
          WHERE user_id = $1 AND competition_id = $2 AND status = 'approved'
        `, [userId, competitionId]),
        pool.query(`
          SELECT ua.id, ad.code, ad.name, ad.description, ad.emoji, ua.awarded_at
          FROM user_achievements ua
          INNER JOIN achievement_definitions ad ON ad.id = ua.achievement_id
          WHERE ua.user_id = $1
            AND ua.competition_id = $2
            AND ua.revoked_at IS NULL
          ORDER BY ua.awarded_at DESC
        `, [userId, competitionId]),
      ]);
    }

    const [settingsResult, countsResult, recentResult, auditResult] = await Promise.all([
      pool.query<FeedSettingsRow>(`
        SELECT
          report_chat_id IS NOT NULL AND btrim(report_chat_id::text) <> '' AS chat_configured,
          group_feed_enabled,
          activity_digest_enabled,
          activity_digest_interval_minutes,
          achievement_announcements_enabled,
          leaderboard_announcements_enabled,
          daily_summary_enabled
        FROM contest_settings
        WHERE competition_id = $1
        LIMIT 1
      `, [competitionId]),
      pool.query<FeedCountRow>(`
        SELECT event_type, status, count(*)::int AS count
        FROM group_feed_events
        WHERE competition_id = $1
        GROUP BY event_type, status
        ORDER BY event_type, status
      `, [competitionId]),
      pool.query<FeedEventRow>(`
        SELECT event_type, status, attempt_count, error_message, created_at, last_attempt_at, available_at
        FROM group_feed_events
        WHERE competition_id = $1
        ORDER BY id DESC
        LIMIT 12
      `, [competitionId]),
      pool.query<{ action: string; result: string; created_at: Date }>(`
        SELECT action, result, created_at
        FROM audit_logs
        WHERE action LIKE 'GROUP_%'
        ORDER BY id DESC
        LIMIT 10
      `),
    ]);

    const counts = Object.fromEntries(
      countsResult.rows.map((row) => [`${row.event_type}:${row.status}`, row.count]),
    );

    return NextResponse.json({
      status: "ok",
      groupFeedDiagnostic: {
        envFallbackConfigured: Boolean(process.env.TELEGRAM_REPORT_CHAT_ID),
        settings: settingsResult.rows[0] ?? null,
        counts,
        recentEvents: recentResult.rows.map((row) => ({
          eventType: row.event_type,
          status: row.status,
          attemptCount: row.attempt_count,
          error: sanitizeError(row.error_message),
          createdAt: row.created_at,
          lastAttemptAt: row.last_attempt_at,
          availableAt: row.available_at,
        })),
        recentAudit: auditResult.rows.map((row) => ({
          action: row.action,
          result: row.result,
          createdAt: row.created_at,
        })),
      },
    });
  } catch (error) {
    console.error(
      "[health] Database or startup query unavailable",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
