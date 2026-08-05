import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("bot puts a heart reaction on messages in the configured report thread", async () => {
  const [webhook, telegram, readme] = await Promise.all([
    readFile("app/api/bot/webhook/route.ts", "utf8"),
    readFile("lib/telegram-bot.ts", "utf8"),
    readFile("README.md", "utf8"),
  ]);

  assert.match(webhook, /message_thread_id/);
  assert.match(webhook, /TELEGRAM_REPORT_THREAD_ID/);
  assert.match(webhook, /setTelegramHeartReaction/);
  assert.match(telegram, /setMessageReaction/);
  assert.match(telegram, /reaction: \[\{ type: "emoji", emoji: "❤" \}\]/);
  assert.match(readme, /TELEGRAM_REPORT_THREAD_ID/);
});
