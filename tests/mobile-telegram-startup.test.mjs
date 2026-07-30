import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile Telegram waits for initData before mounting the app", async () => {
  const [layout, gate, nextConfig] = await Promise.all([
    readFile("app/layout.tsx", "utf8"),
    readFile("app/telegram-gate.tsx", "utf8"),
    readFile("next.config.ts", "utf8"),
  ]);

  assert.match(layout, /<TelegramGate>\{children\}<\/TelegramGate>/);
  assert.match(layout, /telegram-web-app\.js\?63/);
  assert.match(gate, /tgWebAppData/);
  assert.match(gate, /TelegramWebviewProxy/);
  assert.match(gate, /Date\.now\(\) \+ 8_000/);
  assert.match(gate, /window\.setTimeout\(check, 50\)/);
  assert.match(nextConfig, /no-store, no-cache, must-revalidate/);
});
