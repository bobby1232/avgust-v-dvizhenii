import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile startup cannot be blocked by Telegram CDN", async () => {
  const layout = await readFile("app/layout.tsx", "utf8");

  assert.match(layout, /telegram-web-app\.js\?63" async/);
  assert.match(layout, /postReadyEvent/);
  assert.match(layout, /web_app_ready/);
  assert.match(layout, /webApp\.ready\(\)/);
  assert.match(layout, /webApp\.expand\(\)/);
  assert.match(layout, /<body>\{children\}<\/body>/);

  const bootstrap = layout.indexOf("dangerouslySetInnerHTML");
  const sdk = layout.indexOf("telegram-web-app.js?63");
  assert.ok(bootstrap >= 0 && sdk > bootstrap, "non-blocking bootstrap must run before the external SDK");
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
