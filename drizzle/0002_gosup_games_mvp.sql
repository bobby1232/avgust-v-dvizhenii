ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "timezone" varchar(64) DEFAULT 'Europe/Moscow' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notifications_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bot_started_at" timestamptz;
ALTER TABLE "activities" ALTER COLUMN "activity_type" TYPE varchar(120);
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "custom_activity_name" varchar(120);
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "duration_minutes" integer DEFAULT 20 NOT NULL;
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "evidence_type" varchar(32);
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "evidence_url" varchar(1000);
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "telegram_file_id" varchar(512);
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'approved' NOT NULL;
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "moderation_comment" varchar(500);
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "created_by" bigint REFERENCES "users"("id");
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "updated_by" bigint REFERENCES "users"("id");
ALTER TABLE "activities" ADD CONSTRAINT "activities_duration_check" CHECK ("duration_minutes" BETWEEN 20 AND 1440);
ALTER TABLE "activities" ADD CONSTRAINT "activities_status_check" CHECK ("status" IN ('approved', 'pending', 'rejected'));
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "old_value" jsonb;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "new_value" jsonb;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "comment" varchar(500);
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "result" varchar(32) DEFAULT 'success' NOT NULL;

UPDATE "competitions"
SET "name" = 'GOSUP GAMES | 31 день в игре',
    "start_date" = '2026-08-01',
    "end_date" = '2026-08-31',
    "timezone" = 'Europe/Moscow',
    "updated_at" = now()
WHERE "is_active" = true;

CREATE TABLE "activity_types" (
  "id" bigserial PRIMARY KEY,
  "code" varchar(64) NOT NULL UNIQUE,
  "name" varchar(120) NOT NULL UNIQUE,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

INSERT INTO "activity_types" ("code", "name", "sort_order") VALUES
  ('run', 'Бег', 10), ('walk', 'Ходьба', 20), ('sup', 'SUP', 30),
  ('bike', 'Велосипед', 40), ('swim', 'Плавание', 50), ('gym', 'Тренировка в зале', 60),
  ('workout', 'Турник / воркаут', 70), ('yoga', 'Йога', 80), ('stretching', 'Растяжка', 90),
  ('football', 'Футбол', 100), ('team', 'Командная игра', 110),
  ('family', 'Семейная тренировка', 120), ('friend', 'Тренировка с другом', 130),
  ('other', 'Другое', 140)
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE "activity_days" (
  "id" bigserial PRIMARY KEY,
  "competition_id" bigint NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "activity_date" date NOT NULL,
  "first_activity_id" bigint REFERENCES "activities"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "activity_days_competition_user_date_idx" ON "activity_days" ("competition_id", "user_id", "activity_date");
CREATE INDEX "activity_days_user_idx" ON "activity_days" ("user_id");
INSERT INTO "activity_days" ("competition_id", "user_id", "activity_date", "first_activity_id")
SELECT "competition_id", "user_id", "activity_date", min("id")
FROM "activities"
WHERE "status" = 'approved'
GROUP BY "competition_id", "user_id", "activity_date"
ON CONFLICT ("competition_id", "user_id", "activity_date") DO NOTHING;

CREATE TABLE "achievement_definitions" (
  "id" bigserial PRIMARY KEY, "code" varchar(64) NOT NULL UNIQUE, "name" varchar(160) NOT NULL,
  "description" varchar(500) NOT NULL, "emoji" varchar(24) NOT NULL,
  "category" varchar(64) DEFAULT 'streak' NOT NULL, "trigger_type" varchar(64) NOT NULL,
  "trigger_value" integer, "is_automatic" boolean DEFAULT true NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL, "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
INSERT INTO "achievement_definitions" ("code", "name", "description", "emoji", "trigger_type", "trigger_value") VALUES
  ('STREAK_3', 'Старт дан', 'Серия 3 дня', '🟢', 'streak', 3),
  ('STREAK_7', 'Стабильность', 'Серия 7 дней', '🔵', 'streak', 7),
  ('STREAK_14', 'Дисциплина', 'Серия 14 дней', '🟣', 'streak', 14),
  ('STREAK_21', 'Не остановить', 'Серия 21 день', '🔴', 'streak', 21),
  ('STREAK_31', '31 день в игре', 'Все 31 день без пропусков', '🟡', 'streak', 31)
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE "user_achievements" (
  "id" bigserial PRIMARY KEY,
  "competition_id" bigint NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "achievement_id" bigint NOT NULL REFERENCES "achievement_definitions"("id"),
  "awarded_at" timestamptz DEFAULT now() NOT NULL, "awarded_by" bigint REFERENCES "users"("id"),
  "source" varchar(32) DEFAULT 'automatic' NOT NULL, "revoked_at" timestamptz,
  "revoked_by" bigint REFERENCES "users"("id"), "comment" varchar(500)
);
CREATE UNIQUE INDEX "user_achievements_unique_idx" ON "user_achievements" ("competition_id", "user_id", "achievement_id");
CREATE INDEX "user_achievements_user_idx" ON "user_achievements" ("user_id");

CREATE TABLE "notification_logs" (
  "id" bigserial PRIMARY KEY, "competition_id" bigint NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "notification_type" varchar(64) NOT NULL, "notification_date" date NOT NULL,
  "sent_at" timestamptz, "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "telegram_message_id" bigint, "error_message" varchar(500)
);
CREATE UNIQUE INDEX "notification_logs_unique_idx" ON "notification_logs" ("competition_id", "user_id", "notification_type", "notification_date");

CREATE TABLE "contest_settings" (
  "id" bigserial PRIMARY KEY, "competition_id" bigint NOT NULL UNIQUE REFERENCES "competitions"("id") ON DELETE CASCADE,
  "minimum_duration_minutes" integer DEFAULT 20 NOT NULL, "reminder_time" time DEFAULT '20:00:00' NOT NULL,
  "report_chat_id" bigint, "reminders_enabled" boolean DEFAULT true NOT NULL,
  "weekly_report_enabled" boolean DEFAULT true NOT NULL, "total_goal" integer,
  "next_group_workout" text, "updated_at" timestamptz DEFAULT now() NOT NULL
);
INSERT INTO "contest_settings" ("competition_id")
SELECT "id" FROM "competitions" WHERE "is_active" = true ON CONFLICT ("competition_id") DO NOTHING;

CREATE TABLE "weekly_themes" (
  "id" bigserial PRIMARY KEY, "competition_id" bigint NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "start_date" date NOT NULL, "end_date" date NOT NULL, "title" varchar(160) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL
);
INSERT INTO "weekly_themes" ("competition_id", "start_date", "end_date", "title")
SELECT "id", theme.start_date::date, theme.end_date::date, theme.title
FROM "competitions"
CROSS JOIN (VALUES
 ('2026-08-01', '2026-08-02', 'Начинаем'), ('2026-08-03', '2026-08-09', 'Пробуем новое'),
 ('2026-08-10', '2026-08-16', 'Двигаемся вместе'), ('2026-08-17', '2026-08-23', 'Не останавливаемся'),
 ('2026-08-24', '2026-08-31', 'Финишируем')
) AS theme(start_date, end_date, title)
WHERE "competitions"."is_active" = true;

CREATE TABLE "group_workouts" (
  "id" bigserial PRIMARY KEY, "competition_id" bigint NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "title" varchar(160) NOT NULL, "starts_at" timestamptz NOT NULL,
  "description" varchar(500), "is_active" boolean DEFAULT true NOT NULL
);
CREATE TABLE "weekly_reports" (
  "id" bigserial PRIMARY KEY, "competition_id" bigint NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "report_date" date NOT NULL, "sent_at" timestamptz, "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "telegram_message_id" bigint, "error_message" varchar(500)
);
CREATE UNIQUE INDEX "weekly_reports_unique_idx" ON "weekly_reports" ("competition_id", "report_date");
CREATE TABLE "bot_updates" ("update_id" bigint PRIMARY KEY, "processed_at" timestamptz DEFAULT now() NOT NULL);

CREATE TABLE "draws" (
  "id" bigserial PRIMARY KEY, "competition_id" bigint NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "run_id" varchar(64) NOT NULL UNIQUE, "winners_count" integer NOT NULL,
  "exclude_previous_winners" boolean DEFAULT false NOT NULL, "comment" varchar(500),
  "created_by" bigint REFERENCES "users"("id"), "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE "draw_participants" (
  "id" bigserial PRIMARY KEY, "draw_id" bigint NOT NULL REFERENCES "draws"("id") ON DELETE CASCADE,
  "user_id" bigint NOT NULL REFERENCES "users"("id"), "active_days" integer NOT NULL
);
CREATE UNIQUE INDEX "draw_participants_unique_idx" ON "draw_participants" ("draw_id", "user_id");
CREATE TABLE "draw_winners" (
  "id" bigserial PRIMARY KEY, "draw_id" bigint NOT NULL REFERENCES "draws"("id") ON DELETE CASCADE,
  "user_id" bigint NOT NULL REFERENCES "users"("id"), "position" integer NOT NULL
);
CREATE UNIQUE INDEX "draw_winners_user_idx" ON "draw_winners" ("draw_id", "user_id");
CREATE UNIQUE INDEX "draw_winners_position_idx" ON "draw_winners" ("draw_id", "position");
