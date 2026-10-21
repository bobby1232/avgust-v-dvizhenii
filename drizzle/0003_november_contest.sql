-- Preserve all historical users, activities, achievements and draw results.
SELECT pg_advisory_xact_lock(8122026);
--> statement-breakpoint
UPDATE competitions SET is_active = false, updated_at = now()
WHERE is_active = true AND start_date < '2026-11-01';
--> statement-breakpoint
INSERT INTO competitions (name, start_date, end_date, timezone, is_active)
SELECT 'Ноябрь в движении', '2026-11-01', '2026-11-30', 'Europe/Moscow', true
WHERE NOT EXISTS (SELECT 1 FROM competitions WHERE start_date = '2026-11-01')
AND NOT EXISTS (SELECT 1 FROM competitions WHERE is_active = true);
--> statement-breakpoint
INSERT INTO contest_settings (competition_id, minimum_duration_minutes, reminder_time, report_chat_id, reminders_enabled, weekly_report_enabled)
SELECT c.id, COALESCE(s.minimum_duration_minutes,20), COALESCE(s.reminder_time,'20:00:00'::time), s.report_chat_id, COALESCE(s.reminders_enabled,true), COALESCE(s.weekly_report_enabled,true)
FROM competitions c LEFT JOIN LATERAL (
 SELECT cs.* FROM contest_settings cs JOIN competitions old ON old.id=cs.competition_id
 WHERE old.start_date < c.start_date ORDER BY old.start_date DESC LIMIT 1
) s ON true WHERE c.start_date='2026-11-01'
ON CONFLICT (competition_id) DO NOTHING;
