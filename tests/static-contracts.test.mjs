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

test("admin reset deletes users and requires explicit destructive confirmation", async () => {
  const [page, route] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/api/admin/reset-contest/route.ts", "utf8"),
  ]);
  assert.match(page, /Сбросить результаты и начать заново/);
  assert.match(page, /Все пользователи и их результаты будут удалены/);
  assert.match(page, /competitionResetConfirmation !== "УДАЛИТЬ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ"/);
  assert.match(route, /await tx\.delete\(users\)/);
  assert.match(route, /resetSchema\.safeParse\(body\)/);
  assert.doesNotMatch(page, /\bXP\b|последнее место/i);
  assert.match(page, /GOSUP GAMES/);
});

test("duration input uses a stable numeric keyboard without leading zeroes", async () => {
  const page = await readFile("app/page.tsx", "utf8");
  assert.match(page, /inputMode="numeric"/);
  assert.match(page, /event\.currentTarget\.select\(\)/);
  assert.match(page, /replace\(\/\^0\+\(\?=\\d\)\//);
  assert.doesNotMatch(page, /Продолжительность, минут<input type="number"/);
});

test("photo proof options are included in app and bot rules", async () => {
  const [page, webhook] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/api/bot/webhook/route.ts", "utf8"),
  ]);
  for (const rules of [page, webhook]) {
    assert.match(rules, /фото из приложения или с часов/);
    assert.match(rules, /себя рядом с местом или инвентарём/);
  }
});

test("admin tab labels keep their width and scroll on narrow screens", async () => {
  const styles = await readFile("app/globals.css", "utf8");
  assert.match(styles, /\.admin-tabs \{[^}]*overflow-x: auto/);
  assert.match(styles, /\.admin-tabs button \{[^}]*flex: 0 0 auto/);
  assert.match(styles, /\.admin-tabs button \{[^}]*white-space: nowrap/);
});
