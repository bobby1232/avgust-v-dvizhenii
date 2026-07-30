import assert from "node:assert/strict";
import test from "node:test";
import {
  competitionPhase,
  getCompetitionDate,
  getElapsedCompetitionDates,
  isCompetitionDay,
} from "../lib/competition-time.ts";
import { calculateProgress } from "../lib/progress-service.ts";

const competition = {
  startDate: "2026-08-01",
  endDate: "2026-08-31",
  timezone: "Europe/Moscow",
};

test("Moscow date differs from UTC around midnight", () => {
  assert.equal(getCompetitionDate(new Date("2026-07-31T21:01:00Z")), "2026-08-01");
  assert.equal(getCompetitionDate(new Date("2026-08-01T20:59:00Z")), "2026-08-01");
  assert.equal(getCompetitionDate(new Date("2026-08-01T21:01:00Z")), "2026-08-02");
});

test("competition boundaries are inclusive", () => {
  assert.equal(isCompetitionDay("2026-07-31", competition), false);
  assert.equal(isCompetitionDay("2026-08-01", competition), true);
  assert.equal(isCompetitionDay("2026-08-31", competition), true);
  assert.equal(isCompetitionDay("2026-09-01", competition), false);
});

test("test mode skips only the competition start date check", () => {
  const previous = process.env.SKIP_COMPETITION_START_DATE_CHECK;
  process.env.SKIP_COMPETITION_START_DATE_CHECK = "true";
  try {
    const beforeStart = new Date("2026-07-30T12:00:00Z");
    assert.equal(competitionPhase(competition, beforeStart), "active");
    assert.equal(isCompetitionDay("2026-07-30", competition), true);
    assert.deepEqual(getElapsedCompetitionDates(competition, beforeStart), ["2026-07-30"]);
    assert.equal(isCompetitionDay("2026-09-01", competition), false);
  } finally {
    if (previous === undefined) delete process.env.SKIP_COMPETITION_START_DATE_CHECK;
    else process.env.SKIP_COMPETITION_START_DATE_CHECK = previous;
  }
});

test("elapsed dates stop at competition end", () => {
  assert.equal(getElapsedCompetitionDates(competition, new Date("2026-09-05T12:00:00Z")).length, 31);
});

test("today is not missed and yesterday keeps current streak", () => {
  const progress = calculateProgress(
    ["2026-08-01", "2026-08-02", "2026-08-02"],
    competition,
    new Date("2026-08-03T12:00:00Z"),
  );
  assert.deepEqual(
    { active: progress.activeDays, current: progress.currentStreak, max: progress.maxStreak, missed: progress.missedDays },
    { active: 2, current: 2, max: 2, missed: 0 },
  );
});

test("a completed missed day resets current streak but preserves maximum", () => {
  const progress = calculateProgress(
    ["2026-08-01", "2026-08-02", "2026-08-04"],
    competition,
    new Date("2026-08-05T12:00:00Z"),
  );
  assert.equal(progress.currentStreak, 1);
  assert.equal(progress.maxStreak, 2);
  assert.equal(progress.missedDays, 1);
});
