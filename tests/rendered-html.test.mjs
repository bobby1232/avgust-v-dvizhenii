import assert from "node:assert/strict";
import test from "node:test";

test("renders the competition mini app", { skip: "legacy vinext dist is not produced by the Next.js build" }, async () => {
  const { default: worker } = await import(new URL(`../dist/server/index.js?${Date.now()}`, import.meta.url));
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /GOSUP GAMES/i);
  assert.match(html, /Отметить активность/i);
  assert.doesNotMatch(html, /codex-preview/);
});
