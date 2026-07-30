import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("progress ring stays circular at desktop and mobile sizes", async () => {
  const [css, databaseCss] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/database.css", import.meta.url), "utf8"),
  ]);
  const ringRule = css.match(/\.ring\s*\{([^}]+)\}/)?.[1] ?? "";
  const mobileRingRule = databaseCss.match(/\.ring\s*\{([^}]+)\}/)?.[1] ?? "";

  assert.match(ringRule, /width:\s*130px/);
  assert.match(ringRule, /height:\s*130px/);
  assert.match(ringRule, /aspect-ratio:\s*1/);
  assert.match(ringRule, /border-radius:\s*50%/);
  assert.match(mobileRingRule, /width:\s*105px/);
  assert.match(mobileRingRule, /height:\s*105px/);
});
