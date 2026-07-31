import { NextResponse } from "next/server";
import { getPool } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getPool();
  const [settings, summary, recent, counts] = await Promise.all([
    pool.query(`
      SELECT cs.competition_id,
             cs.report_chat_id IS NOT NULL AS report_chat_configured,
             cs.group_feed_enabled,
             cs.activity_digest_enabled,
             cs.activity_digest_interval_minutes,
             cs.achievement_announcements_enabled,
             cs.leaderboard_announcements_enabled,
             cs.daily_summary_enabled,
             cs.leaderboard_day_time,
             cs.leaderboard_evening_time,
             cs.daily_summary_time
      FROM contest_settings cs
      JOIN competitions c ON c.id = cs.competition_id
      WHERE c.is_active = true
      LIMIT 1
    `),
    pool.query(`
      SELECT event_type, status, count(*)::int AS count
      FROM group_feed_events
      GROUP BY event_type, status
      ORDER BY event_type, status
    `),
    pool.query(`
      SELECT id, event_type, status, attempt_count, created_at, available_at,
             sent_at, telegram_message_id IS NOT NULL AS has_message_id,
             error_message
      FROM group_feed_events
      ORDER BY id DESC
      LIMIT 20
    `),
    pool.query(`
      SELECT
        (SELECT count(*)::int FROM activities WHERE status = 'approved') AS approved_activities,
        (SELECT count(*)::int FROM user_achievements WHERE revoked_at IS NULL) AS active_achievements,
        (SELECT count(*)::int FROM group_feed_events) AS group_feed_events
    `),
  ]);

  return NextResponse.json({
    envFallbackChatConfigured: Boolean(process.env.TELEGRAM_REPORT_CHAT_ID),
    settings: settings.rows[0] ?? null,
    eventSummary: summary.rows,
    recentEvents: recent.rows,
    counts: counts.rows[0] ?? null,
  });
}
