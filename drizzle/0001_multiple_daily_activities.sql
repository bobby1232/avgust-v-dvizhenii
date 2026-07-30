DROP INDEX IF EXISTS "activities_user_day_idx";
CREATE INDEX "activities_user_day_idx" ON "activities" ("competition_id", "user_id", "activity_date");
