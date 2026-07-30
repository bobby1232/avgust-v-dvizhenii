import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile startup uses the working bootstrap without a mount gate", async () => {
  const layout = await readFile("app/layout.tsx", "utf8");

  assert.match(layout, /postTelegramEvent\('web_app_ready'/);
  assert.match(layout, /telegram-web-app\.js\?59" async/);
  assert.match(layout, /<body>\{children\}<\/body>/);
  assert.doesNotMatch(layout, /TelegramGate|telegram-gate/);
});

test("secondary API requests cannot block the first app render", async () => {
  const page = await readFile("app/page.tsx", "utf8");

  assert.match(page, /Promise\.allSettled/);
  assert.match(page, /void loadRegisteredData\(current\.role\)/);
  assert.doesNotMatch(page, /if \(current\.registered\) await loadRegisteredData/);

  const firstPaint = page.indexOf("setLoading(false);");
  const backgroundLoad = page.indexOf("void loadRegisteredData(current.role)");
  assert.ok(firstPaint >= 0 && backgroundLoad > firstPaint);
});
