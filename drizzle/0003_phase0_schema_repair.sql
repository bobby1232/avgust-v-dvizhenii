ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notifications_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bot_started_at" timestamptz;

ALTER TABLE "competitions" DROP COLUMN IF EXISTS "notifications_enabled";
ALTER TABLE "competitions" DROP COLUMN IF EXISTS "bot_started_at";

ALTER TABLE "notification_logs" ADD COLUMN IF NOT EXISTS "attempt_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "notification_logs" ADD COLUMN IF NOT EXISTS "last_attempt_at" timestamptz;

ALTER TABLE "weekly_reports" ADD COLUMN IF NOT EXISTS "period_start" date;
ALTER TABLE "weekly_reports" ADD COLUMN IF NOT EXISTS "period_end" date;
ALTER TABLE "weekly_reports" ADD COLUMN IF NOT EXISTS "attempt_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "weekly_reports" ADD COLUMN IF NOT EXISTS "last_attempt_at" timestamptz;

ALTER TABLE "user_achievements" ADD COLUMN IF NOT EXISTS "revocation_source" varchar(32);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activities_duration_check'
  ) THEN
    ALTER TABLE "activities"
      ADD CONSTRAINT "activities_duration_check" CHECK ("duration_minutes" BETWEEN 20 AND 1440);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activities_status_check'
  ) THEN
    ALTER TABLE "activities"
      ADD CONSTRAINT "activities_status_check" CHECK ("status" IN ('approved', 'pending', 'rejected'));
  END IF;
END $$;

INSERT INTO "achievement_definitions"
  ("code", "name", "description", "emoji", "category", "trigger_type", "trigger_value", "is_automatic")
VALUES
  ('FIRST_SUP', 'Первый SUP', 'Первая SUP-тренировка', '🌊', 'activity', 'activity_type', NULL, true),
  ('RUNNER', 'Бегун', 'Первая пробежка', '🏃', 'activity', 'activity_type', NULL, true),
  ('WORKOUT', 'Турникмен', 'Тренировка на турнике или воркаут', '💪', 'activity', 'activity_type', NULL, true),
  ('EARLY_START', 'Ранний старт', 'Активность до 08:00', '🌅', 'time', 'activity_time', 8, true),
  ('FAMILY', 'Семья в игре', 'Семейная тренировка', '👨‍👩‍👧', 'activity', 'activity_type', NULL, true),
  ('WITH_FRIEND', 'Вместе веселее', 'Тренировка с другом или участником игры', '🤝', 'activity', 'activity_type', NULL, true),
  ('BAD_WEATHER', 'Погода не помеха', 'Активность в сложных погодных условиях', '🌧', 'manual', 'manual', NULL, false),
  ('RECOVERY', 'Время восстановиться', 'Йога или растяжка', '🧘', 'activity', 'activity_type', NULL, true),
  ('TRY_NEW', 'Попробовал новое', 'Новый вид активности', '🚴', 'activity', 'distinct_activity_type', 2, true),
  ('WEEKEND', 'Выходные в игре', 'Активность в субботу и воскресенье одной пары выходных', '🔥', 'combination', 'weekend_pair', NULL, true),
  ('RETURN', 'Возвращение', 'После пропуска новая серия достигла семи дней', '🔄', 'combination', 'return_streak', 7, true)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "emoji" = EXCLUDED."emoji",
  "category" = EXCLUDED."category",
  "trigger_type" = EXCLUDED."trigger_type",
  "trigger_value" = EXCLUDED."trigger_value",
  "is_automatic" = EXCLUDED."is_automatic";

CREATE TABLE IF NOT EXISTS "broadcast_runs" (
  "id" bigserial PRIMARY KEY,
  "competition_id" bigint NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "audience" varchar(64) NOT NULL,
  "minimum_active_days" integer,
  "message" text NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "created_by" bigint NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "broadcast_results" (
  "id" bigserial PRIMARY KEY,
  "broadcast_id" bigint NOT NULL REFERENCES "broadcast_runs"("id") ON DELETE CASCADE,
  "user_id" bigint NOT NULL REFERENCES "users"("id"),
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "telegram_message_id" bigint,
  "error_message" varchar(500)
);
CREATE UNIQUE INDEX IF NOT EXISTS "broadcast_results_unique_idx"
  ON "broadcast_results" ("broadcast_id", "user_id");
