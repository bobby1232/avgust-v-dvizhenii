import { NextResponse } from "next/server";
import { getPool } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const pool = getPool();
  const [settings, counts, latest, activityCount] = await Promise.all([
    pool.query(`
      SELECT
        cs.group_feed_enabled,
        cs.activity_digest_enabled,
        cs.activity_digest_interval_minutes,
        cs.achievement_announcements_enabled,
        cs.leaderboard_announcements_enabled,
        cs.daily_summary_enabled,
        (cs.report_chat_id IS NOT NULL) AS report_chat_configured,
        (current_setting('app.telegram_report_chat_id', true) IS NOT NULL) AS env_chat_visible
      FROM contest_settings cs
      INNER JOIN competitions c ON c.id = cs.competition_id
      WHERE c.is_active = true
      LIMIT 1
    `),
    pool.query(`
      SELECT event_type, status, count(*)::int AS count,
             max(created_at) AS newest_created_at,
             max(last_attempt_at) AS newest_attempt_at,
             max(sent_at) AS newest_sent_at
      FROM group_feed_events
      GROUP BY event_type, status
      ORDER BY event_type, status
    `),
    pool.query(`
      SELECT id, event_type, status, attempt_count,
             created_at, available_at, last_attempt_at, sent_at,
             left(coalesce(error_message, ''), 300) AS error_message
      FROM group_feed_events
      ORDER BY id DESC
      LIMIT 20
    `),
    pool.query(`
      SELECT count(*)::int AS approved_activities,
             max(created_at) AS newest_activity_at
      FROM activities
      WHERE status = 'approved'
    `),
  ]);

  return NextResponse.json({
    settings: settings.rows[0] ?? null,
    counts: counts.rows,
    latest: latest.rows,
    activities: activityCount.rows[0] ?? null,
    checkedAt: new Date().toISOString(),
  });
}
