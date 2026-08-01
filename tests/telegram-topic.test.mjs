import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("configured group publications are sent to a Telegram forum topic", async () => {
  const source = await read("lib/telegram-bot.ts");

  assert.match(source, /TELEGRAM_REPORT_MESSAGE_THREAD_ID/);
  assert.match(source, /reportChatId !== chatId/);
  assert.match(source, /message_thread_id: messageThreadId/);
  assert.equal(source.match(/form\.set\("message_thread_id"/g)?.length, 2);
  assert.match(source, /messageThreadId: options\.messageThreadId/);
});

test("topic id can be discovered from a command sent inside the target topic", async () => {
  const source = await read("app/api/bot/webhook/route.ts");

  assert.match(source, /message_thread_id: z\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/);
  assert.match(source, /command === "\/topicid"/);
  assert.match(source, /TELEGRAM_REPORT_CHAT_ID=<code>/);
  assert.match(source, /TELEGRAM_REPORT_MESSAGE_THREAD_ID=<code>/);
  assert.match(source, /\{ messageThreadId \}/);
});
