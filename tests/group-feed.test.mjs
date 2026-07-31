import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("group feed migration provides durable deduplication and locking indexes", async () => {
  const migration = await read("drizzle/0004_group_feed_outbox.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "group_feed_events"/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS "group_feed_events_dedupe_idx"/);
  assert.match(migration, /activity_digest_interval_minutes" BETWEEN 1 AND 120/);
});

test("activity and achievement writes enqueue only returned physical rows", async () => {
  const [activity, achievement, outbox] = await Promise.all([
    read("lib/activity-service.ts"), read("lib/achievement-service.ts"), read("lib/group-feed-outbox.ts"),
  ]);
  assert.match(activity, /enqueueActivityEvent\(tx/);
  assert.match(achievement, /for \(const row of inserted\) await enqueueAchievementEvent/);
  assert.match(outbox, /activity:\$\{activity\.id\}:approved/);
  assert.match(outbox, /achievement:\$\{input\.id\}:awarded/);
});

test("group feed uses textual bot navigation without inline buttons", async () => {
  const source = await read("lib/group-feed-service.ts");

  assert.doesNotMatch(source, /buttonText|buttonUrl|appUrl/);
  assert.doesNotMatch(source, /sendLongTelegramMessage\([^;]*,\s*\{/);
  assert.equal(source.match(/Открыть приложение: @Gosup_comp_bot/g)?.length, 2);
  assert.match(source, /Открыть таблицу: @Gosup_comp_bot/);
  assert.match(source, /Продолжить в приложении: @Gosup_comp_bot/);
  assert.equal(source.match(/Команда: \/app/g)?.length, 4);
});

test("processor uses leases, skip locked, retry ceiling, escaping and message splitting", async () => {
  const [service, telegram] = await Promise.all([read("lib/group-feed-service.ts"), read("lib/telegram-bot.ts")]);
  assert.match(service, /FOR UPDATE SKIP LOCKED/);
  assert.match(service, /MAX_ATTEMPTS = 5/);
  assert.match(service, /interval '10 minutes'/);
  assert.match(telegram, /escapeTelegramHtml/);
  assert.match(telegram, /splitTelegramHtml/);
  assert.match(telegram, /retry_after/);
});

test("group messages show a participant's Telegram username in parentheses", async () => {
  const [service, outbox, data] = await Promise.all([
    read("lib/group-feed-service.ts"), read("lib/group-feed-outbox.ts"), read("lib/data.ts"),
  ]);
  assert.match(service, /function participantName/);
  assert.match(service, /`\$\{name\} \(@\$\{h\(username\)\}\)`/);
  assert.equal(service.match(/participantName\(/g)?.length, 4);
  assert.match(outbox, /telegramUsername: user\.telegramUsername/);
  assert.match(data, /telegramUsername: user\.telegramUsername/);
});

test("cron endpoint is bearer protected and has no business payload", async () => {
  const route = await read("app/api/cron/group-feed/route.ts");
  assert.match(route, /authorization/);
  assert.match(route, /Bearer \$\{secret\}/);
  assert.doesNotMatch(route, /request\.json/);
});
