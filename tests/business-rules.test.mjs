import assert from "node:assert/strict";
import test from "node:test";
import { activitySchema } from "../lib/validation.ts";
import { calculateProgress } from "../lib/progress-service.ts";
import { eligibleActivityAchievementCodes } from "../lib/achievement-rules.ts";
import { safeCsvCell } from "../lib/csv.ts";

const competition = {
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  timezone: "Europe/Moscow",
};

test("19 minutes is rejected and 20 minutes is accepted", () => {
  assert.equal(activitySchema.safeParse({ activityType: "Бег", durationMinutes: 19 }).success, false);
  assert.equal(activitySchema.safeParse({ activityType: "Бег", durationMinutes: 20 }).success, true);
});

test("participant payload cannot contain an activity date", () => {
  const result = activitySchema.safeParse({
    activityType: "Бег",
    durationMinutes: 20,
    activityDate: "2026-08-10",
  });
  assert.equal(result.success, true);
  assert.equal("activityDate" in result.data, false);
});

test("two same-day activities create one active day and one streak day", () => {
  const result = calculateProgress(
    ["2026-08-01", "2026-08-01"],
    competition,
    new Date("2026-08-01T12:00:00Z"),
  );
  assert.equal(result.activeDays, 1);
  assert.equal(result.currentStreak, 1);
  assert.equal(result.maxStreak, 1);
});

test("streak thresholds are reached from maximum streak", () => {
  for (const threshold of [3, 7, 14, 21, 31]) {
    const dates = Array.from({ length: threshold }, (_, index) => {
      const date = new Date("2026-08-01T00:00:00Z");
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    const result = calculateProgress(dates, competition, new Date("2026-09-01T12:00:00Z"));
    assert.equal(result.maxStreak, threshold);
  }
});

test("automatic activity, weekend and return achievements are detected", () => {
  const rows = [
    { activityDate: "2026-08-01", activityType: "SUP" },
    { activityDate: "2026-08-02", activityType: "Бег" },
    ...Array.from({ length: 7 }, (_, index) => ({
      activityDate: `2026-08-${String(index + 4).padStart(2, "0")}`,
      activityType: "Йога",
    })),
  ];
  const codes = new Set(eligibleActivityAchievementCodes(rows, "2026-08-01"));
  for (const code of ["FIRST_SUP", "RUNNER", "RECOVERY", "TRY_NEW", "WEEKEND", "RETURN"]) {
    assert.equal(codes.has(code), true, code);
  }
});

test("CSV cells neutralize spreadsheet formulas", () => {
  for (const value of ["=1+1", "+SUM(A1)", "-2+3", "@cmd"]) {
    assert.match(safeCsvCell(value), /^"'[=+\-@]/);
  }
});
