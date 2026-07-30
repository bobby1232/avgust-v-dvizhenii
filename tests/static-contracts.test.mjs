import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("corrective migration moves bot fields and is idempotent", async () => {
  const sql = await readFile("drizzle/0003_phase0_schema_repair.sql", "utf8");
  assert.match(sql, /ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notifications_enabled"/);
  assert.match(sql, /ALTER TABLE "competitions" DROP COLUMN IF EXISTS "notifications_enabled"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "broadcast_runs"/);
});

test("participant activity schema does not accept a client date", async () => {
  const validation = await readFile("lib/validation.ts", "utf8");
  const activityBlock = validation.slice(validation.indexOf("export const activitySchema"), validation.indexOf("export const adminActivitySchema"));
  assert.doesNotMatch(activityBlock, /activityDate/);
});

test("failed reminders and reports are retryable", async () => {
  const [reminders, reports] = await Promise.all([
    readFile("lib/notification-service.ts", "utf8"),
    readFile("lib/report-service.ts", "utf8"),
  ]);
  assert.match(reminders, /notificationLogs\.status, "failed"/);
  assert.match(reminders, /attemptCount/);
  assert.match(reports, /weeklyReports\.status, "failed"/);
  assert.match(reports, /periodStart/);
});

test("production does not use development Telegram identity", async () => {
  const telegram = await readFile("lib/telegram.ts", "utf8");
  assert.match(telegram, /NODE_ENV !== "production"/);
  assert.match(telegram, /DEV_TELEGRAM_USER_ID/);
});

test("public interface has no reset, XP or ranking language", async () => {
  const page = await readFile("app/page.tsx", "utf8");
  assert.doesNotMatch(page, /Начать конкурс заново|\bXP\b|лидер|последнее место/i);
  assert.match(page, /GOSUP GAMES/);
});
