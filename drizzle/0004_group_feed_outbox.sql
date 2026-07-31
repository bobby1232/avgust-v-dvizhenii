ALTER TABLE "contest_settings" ADD COLUMN IF NOT EXISTS "group_feed_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "contest_settings" ADD COLUMN IF NOT EXISTS "activity_digest_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "contest_settings" ADD COLUMN IF NOT EXISTS "activity_digest_interval_minutes" integer DEFAULT 10 NOT NULL;
ALTER TABLE "contest_settings" ADD COLUMN IF NOT EXISTS "achievement_announcements_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "contest_settings" ADD COLUMN IF NOT EXISTS "leaderboard_announcements_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "contest_settings" ADD COLUMN IF NOT EXISTS "leaderboard_day_time" time DEFAULT '12:00' NOT NULL;
ALTER TABLE "contest_settings" ADD COLUMN IF NOT EXISTS "leaderboard_evening_time" time DEFAULT '20:30' NOT NULL;
ALTER TABLE "contest_settings" ADD COLUMN IF NOT EXISTS "daily_summary_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "contest_settings" ADD COLUMN IF NOT EXISTS "daily_summary_time" time DEFAULT '21:30' NOT NULL;

CREATE TABLE IF NOT EXISTS "group_feed_events" (
  "id" bigserial PRIMARY KEY,
  "competition_id" bigint NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "event_type" varchar(32) NOT NULL,
  "entity_type" varchar(32) NOT NULL,
  "entity_id" bigint NOT NULL,
  "dedupe_key" varchar(200) NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "available_at" timestamptz DEFAULT now() NOT NULL,
  "sent_at" timestamptz,
  "telegram_message_id" bigint,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_attempt_at" timestamptz,
  "error_message" varchar(500),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "group_feed_events_dedupe_idx" ON "group_feed_events"("dedupe_key");
CREATE INDEX IF NOT EXISTS "group_feed_events_ready_idx" ON "group_feed_events"("status", "available_at");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_feed_events_status_check') THEN
    ALTER TABLE "group_feed_events" ADD CONSTRAINT "group_feed_events_status_check"
      CHECK ("status" IN ('pending','processing','sent','failed','skipped'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contest_settings_digest_interval_check') THEN
    ALTER TABLE "contest_settings" ADD CONSTRAINT "contest_settings_digest_interval_check"
      CHECK ("activity_digest_interval_minutes" BETWEEN 1 AND 120);
  END IF;
END $$;
