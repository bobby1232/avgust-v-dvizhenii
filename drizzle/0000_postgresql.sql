CREATE TYPE "user_role" AS ENUM ('participant', 'admin');
CREATE TABLE "competitions" (
  "id" bigserial PRIMARY KEY, "name" varchar(160) NOT NULL, "start_date" date NOT NULL,
  "end_date" date, "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "competitions_one_active_idx" ON "competitions" ("is_active") WHERE "is_active" = true;
CREATE TABLE "users" (
  "id" bigserial PRIMARY KEY, "telegram_id" bigint NOT NULL UNIQUE, "telegram_username" varchar(64),
  "first_name" varchar(128), "last_name" varchar(128), "display_name" varchar(120) NOT NULL,
  "department" varchar(120), "role" "user_role" DEFAULT 'participant' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL, "registered_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "users_registered_at_idx" ON "users" ("registered_at");
CREATE TABLE "activities" (
  "id" bigserial PRIMARY KEY, "competition_id" bigint NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "activity_date" date NOT NULL,
  "activity_type" varchar(32) NOT NULL, "description" varchar(300),
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "activities_user_id_idx" ON "activities" ("user_id");
CREATE INDEX "activities_competition_id_idx" ON "activities" ("competition_id");
CREATE INDEX "activities_date_idx" ON "activities" ("activity_date");
CREATE UNIQUE INDEX "activities_user_day_idx" ON "activities" ("competition_id", "user_id", "activity_date");
CREATE TABLE "audit_logs" (
  "id" bigserial PRIMARY KEY, "actor_telegram_id" bigint, "action" varchar(80) NOT NULL,
  "entity_type" varchar(80), "entity_id" text, "payload" jsonb, "created_at" timestamptz DEFAULT now() NOT NULL
);
INSERT INTO "competitions" ("name", "start_date", "is_active") VALUES ('Август в движении', CURRENT_DATE, true);
INSERT INTO "audit_logs" ("action", "entity_type", "entity_id") VALUES ('competition.created', 'competition', '1');
