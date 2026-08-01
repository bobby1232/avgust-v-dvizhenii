import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cardCodes = [
  "STREAK_3", "STREAK_7", "STREAK_14", "STREAK_21", "STREAK_31",
  "FIRST_SUP", "RUNNER", "WORKOUT", "EARLY_START", "FAMILY",
  "WITH_FRIEND", "BAD_WEATHER", "RECOVERY", "TRY_NEW", "WEEKEND", "RETURN",
];

function evaluateAchievementRules(expression) {
  const script = `
    import { eligibleActivityAchievementCodes } from "./lib/achievement-rules.ts";
    const result = ${expression};
    process.stdout.write(JSON.stringify(result));
  `;
  const result = spawnSync(process.execPath, [
    "--experimental-strip-types",
    "--input-type=module",
    "--eval",
    script,
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("all achievement card assets are stored in the target branch structure", () => {
  for (const code of cardCodes) {
    assert.equal(existsSync(`public/achievements/${code}.jpg`), true, `${code}.jpg is missing`);
  }
});

test("a late start is not classified as a return", () => {
  const dates = ["05", "06", "07", "08", "09", "10", "11"];
  const rows = dates.map((day) => ({ activityDate: `2026-08-${day}`, activityType: "Бег" }));
  const codes = evaluateAchievementRules(
    `${JSON.stringify(rows)}, "2026-08-01", "Europe/Moscow")`,
  );
  assert.equal(codes.includes("RETURN"), false);
});

test("seven active days after a real gap qualify as a return", () => {
  const dates = ["01", "03", "04", "05", "06", "07", "08", "09"];
  const rows = dates.map((day) => ({ activityDate: `2026-08-${day}`, activityType: "Бег" }));
  const codes = evaluateAchievementRules(
    `${JSON.stringify(rows)}, "2026-08-01", "Europe/Moscow")`,
  );
  assert.equal(codes.includes("RETURN"), true);
});

test("achievement UI renders image cards and queues multiple awards", async () => {
  const [page, styles] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/achievement-cards.css", "utf8"),
  ]);
  assert.match(page, /achievementCardSrc\(achievement\.code\)/);
  assert.match(page, /achievement-card-thumb/);
  assert.match(page, /achievement-modal-art/);
  assert.match(page, /setAchievementQueue\(\(queue\) => \[\.\.\.queue, \.\.\.result\.awardedAchievements\]\)/);
  assert.match(styles, /\.achievement-card-thumb img/);
});

test("automatic and manual re-awards create versioned group events", async () => {
  const [service, route, outbox] = await Promise.all([
    readFile("lib/achievement-service.ts", "utf8"),
    readFile("app/api/admin/achievements/route.ts", "utf8"),
    readFile("lib/group-feed-outbox.ts", "utf8"),
  ]);
  assert.match(service, /revokedAt: null/);
  assert.match(service, /automaticActivityAchievementCodes/);
  assert.match(route, /eventVersion: row\.awardedAt\.toISOString\(\)/);
  assert.match(outbox, /awarded:\$\{eventVersion\}/);
});
