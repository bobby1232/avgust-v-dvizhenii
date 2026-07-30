import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Telegram SDK cannot block the mobile client startup", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");

  assert.match(layout, /telegram-web-app\.js\?59" async/);
  assert.doesNotMatch(layout, /telegram-web-app\.js\?59" defer/);
  assert.ok(
    layout.indexOf("telegramBootstrap") < layout.indexOf("telegram-web-app.js?59"),
    "native ready bootstrap must be emitted before loading the optional SDK",
  );
});

test("mobile authentication can use initData without the Telegram SDK", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /hash\.get\("tgWebAppData"\)/);
});
