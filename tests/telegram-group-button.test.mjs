import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("group messages use URL buttons and private chats keep web_app buttons", async () => {
  const source = await readFile("lib/telegram-bot.ts", "utf8");

  assert.match(source, /chatId\.startsWith\("-"\)/);
  assert.match(source, /\? \{ text, url \}/);
  assert.match(source, /: \{ text, web_app: \{ url \} \}/);
  assert.match(source, /telegramActionButton\(chatId, options\.buttonText, options\.buttonUrl\)/);
});
