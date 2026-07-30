import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("progress ring has equal fixed dimensions", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const ringRule = css.match(/\.ring\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(ringRule, /width:\s*130px/);
  assert.match(ringRule, /height:\s*130px/);
  assert.match(ringRule, /border-radius:\s*50%/);
});
