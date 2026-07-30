import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

const databaseUrl = process.env.MIGRATION_TEST_DATABASE_URL;
const migrationFiles = [
  "drizzle/0000_postgresql.sql",
  "drizzle/0001_multiple_daily_activities.sql",
  "drizzle/0002_gosup_games_mvp.sql",
  "drizzle/0003_phase0_schema_repair.sql",
];

test("migrations preserve data from 0002 and corrective migration is repeatable", {
  skip: databaseUrl ? false : "Set MIGRATION_TEST_DATABASE_URL to an empty disposable PostgreSQL database",
}, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const schema = `migration_test_${Date.now()}`;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    const sql = await Promise.all(migrationFiles.map((file) => readFile(file, "utf8")));
    await client.query(sql[0]);
    await client.query(sql[1]);
    await client.query(
      `INSERT INTO users (telegram_id, display_name) VALUES (123456, 'Тест')`,
    );
    await client.query(
      `INSERT INTO activities (competition_id, user_id, activity_date, activity_type, description)
       SELECT id, 1, start_date, 'Бег', 'Сохранить' FROM competitions WHERE is_active = true`,
    );
    await client.query(sql[2]);
    await client.query(sql[3]);
    await client.query(sql[3]);
    const users = await client.query("SELECT telegram_id, notifications_enabled FROM users");
    const activities = await client.query("SELECT description, duration_minutes FROM activities");
    assert.deepEqual(users.rows, [{ telegram_id: "123456", notifications_enabled: true }]);
    assert.deepEqual(activities.rows, [{ description: "Сохранить", duration_minutes: 20 }]);
    const competitionColumns = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'competitions'
       AND column_name IN ('notifications_enabled', 'bot_started_at')`,
      [schema],
    );
    assert.equal(competitionColumns.rowCount, 0);
  } finally {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});
