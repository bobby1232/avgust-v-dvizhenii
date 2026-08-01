import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Telegram SDK loads synchronously before the native bootstrap", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");

  assert.match(layout, /telegram-web-app\.js\?\d+"/);
  assert.doesNotMatch(layout, /telegram-web-app\.js\?\d+" (?:async|defer)/);
  assert.ok(
    layout.indexOf("telegram-web-app.js") < layout.indexOf("dangerouslySetInnerHTML"),
    "the official Telegram SDK must be emitted before the bootstrap script",
  );
});

test("mobile authentication can use initData without the Telegram SDK", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /hash\.get\("tgWebAppData"\)/);
});
