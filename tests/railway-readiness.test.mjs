import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Stage2 migration can be retried after a partial Railway deployment", async () => {
  const sql = await readFile("drizzle/0002_gosup_games_mvp.sql", "utf8");

  assert.doesNotMatch(sql, /CREATE TABLE(?! IF NOT EXISTS)/);
  assert.doesNotMatch(sql, /CREATE(?: UNIQUE)? INDEX(?! IF NOT EXISTS)/);
  assert.match(sql, /FROM pg_constraint/);
  assert.match(sql, /conrelid = 'activities'::regclass/);
  assert.match(sql, /FROM "weekly_themes" AS existing/);
});

test("Railway healthcheck verifies the migrated schema, not only the connection", async () => {
  const health = await readFile("app/api/health/route.ts", "utf8");

  assert.match(health, /to_regclass\('public\.activity_days'\)/);
  assert.match(health, /to_regclass\('public\.achievement_definitions'\)/);
  assert.match(health, /information_schema\.columns/);
  assert.match(health, /Database schema is incomplete/);
});
