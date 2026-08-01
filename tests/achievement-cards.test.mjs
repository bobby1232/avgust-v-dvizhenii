import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const codes = [
  "STREAK_3", "STREAK_7", "STREAK_14", "STREAK_21", "STREAK_31",
  "FIRST_SUP", "RUNNER", "WORKOUT", "EARLY_START", "FAMILY",
  "WITH_FRIEND", "BAD_WEATHER", "RECOVERY", "TRY_NEW", "WEEKEND", "RETURN",
];

test("all achievement JPEG cards are present", () => {
  for (const code of codes) {
    assert.equal(existsSync(`public/achievements/${code}.jpg`), true, `${code}.jpg is missing`);
  }
});
