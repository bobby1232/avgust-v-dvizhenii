import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("empty archived competitions are hidden without deleting their data", async () => {
  const route = await readFile("app/api/competitions/route.ts", "utf8");
  assert.match(route, /\$\{competitions\.isActive\} = true/);
  assert.match(route, /FROM activity_days ad WHERE ad\.competition_id/);
  assert.match(route, /FROM activities a WHERE a\.competition_id/);
  assert.match(route, /FROM draw_participants dp/);
  assert.match(route, /FROM draw_winners dw/);
  assert.doesNotMatch(route, /OR EXISTS \(SELECT 1 FROM draws d WHERE/);
  assert.doesNotMatch(route, /DELETE FROM competitions/i);
});
