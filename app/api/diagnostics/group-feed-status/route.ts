import { NextResponse } from "next/server";
import { getPool } from "@/db/client";

export const dynamic = "force-dynamic";

type CheckResult = {
  ok: boolean;
  rows?: Array<Record<string, unknown>>;
  error?: string;
};

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Unknown database error")
    .replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[redacted]")
    .slice(0, 300);
}

async function query(sql: string): Promise<CheckResult> {
  try {
    const result = await getPool().query(sql);
    return { ok: true, rows: result.rows };
  } catch (error) {
    return { ok: false, error: safeError(error) };
  }
}

export async function GET() {
  const [settings, counts, latest, activities] = await Promise.all([
    query(`
      SELECT
        cs.group_feed_enabled,
        cs.activity_digest_enabled,
        cs.activity_digest_interval_minutes,
        cs.achievement_announcements_enabled,
        cs.leaderboard_announcements_enabled,
        cs.daily_summary_enabled,
        (cs.report_chat_id IS NOT NULL) AS report_chat_configured
      FROM contest_settings cs
      INNER JOIN competitions c ON c.id = cs.competition_id
      WHERE c.is_active = true
      LIMIT 1
    `),
    query(`
      SELECT event_type, status, count(*)::int AS count,
             max(created_at) AS newest_created_at,
             max(last_attempt_at) AS newest_attempt_at,
             max(sent_at) AS newest_sent_at
      FROM group_feed_events
      GROUP BY event_type, status
      ORDER BY event_type, status
    `),
    query(`
      SELECT id, event_type, status, attempt_count,
             created_at, available_at, last_attempt_at, sent_at,
             left(coalesce(error_message, ''), 300) AS error_message
      FROM group_feed_events
      ORDER BY id DESC
      LIMIT 20
    `),
    query(`
      SELECT count(*)::int AS approved_activities,
             max(created_at) AS newest_activity_at
      FROM activities
      WHERE status = 'approved'
    `),
  ]);

  return NextResponse.json({
    status: [settings, counts, latest, activities].every((item) => item.ok) ? "ok" : "partial",
    envFallbackChatConfigured: Boolean(process.env.TELEGRAM_REPORT_CHAT_ID),
    settings,
    counts,
    latest,
    activities,
    checkedAt: new Date().toISOString(),
  }, {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}
