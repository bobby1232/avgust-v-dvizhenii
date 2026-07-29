import assert from "node:assert/strict";
import test from "node:test";

test("renders the competition mini app", async () => {
  const { default: worker } = await import(new URL(`../dist/server/index.js?${Date.now()}`, import.meta.url));
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Август в движении/i);
  assert.match(html, /Отметить активность/i);
  assert.doesNotMatch(html, /codex-preview/);
});
