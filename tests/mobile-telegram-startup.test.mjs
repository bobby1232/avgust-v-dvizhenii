import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile startup loads the official Telegram SDK synchronously before bootstrap", async () => {
  const layout = await readFile("app/layout.tsx", "utf8");

  assert.match(layout, /telegram-web-app\.js\?63/);
  assert.doesNotMatch(layout, /telegram-web-app\.js\?63"\s+(async|defer)/);
  assert.doesNotMatch(layout, /telegram-web-app\.js\?59/);
  assert.match(layout, /webApp\.ready\(\)/);
  assert.match(layout, /webApp\.expand\(\)/);
  assert.match(layout, /<body>\{children\}<\/body>/);

  const sdk = layout.indexOf("telegram-web-app.js?63");
  const bootstrap = layout.indexOf("dangerouslySetInnerHTML");
  assert.ok(sdk >= 0 && bootstrap > sdk, "Telegram SDK must precede the application bootstrap");
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
