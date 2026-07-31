import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Telegram native controls cannot cover profile and navigation actions", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /--app-safe-top:\s*max\(var\(--tg-content-safe-area-inset-top/);
  assert.match(css, /\.topbar\s*\{[^}]*padding:\s*var\(--app-safe-top\)/s);
  assert.match(css, /\.bottom-nav\s*\{[^}]*padding-bottom:\s*var\(--app-safe-bottom\)/s);
});
