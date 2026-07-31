import assert from "node:assert/strict";
import test from "node:test";
import { getGroupFeedSchedule, getMoscowTime } from "../lib/group-feed-schedule.ts";

const defaults = {
  leaderboardDayTime: "12:00:00",
  leaderboardEveningTime: "20:30:00",
  dailySummaryTime: "21:30:00",
};

test("group publication clock uses Moscow time", () => {
  assert.equal(getMoscowTime(new Date("2026-08-10T09:15:00Z")), "12:15");
});

test("Moscow environment times override stored schedule", () => {
  process.env.LEADERBOARD_DAY_TIME_MSK = "10:05";
  process.env.LEADERBOARD_EVENING_TIME_MSK = "19:45";
  process.env.DAILY_SUMMARY_TIME_MSK = "22:10";
  try {
    assert.deepEqual(getGroupFeedSchedule(defaults), {
      leaderboardDayTime: "10:05",
      leaderboardEveningTime: "19:45",
      dailySummaryTime: "22:10",
    });
  } finally {
    delete process.env.LEADERBOARD_DAY_TIME_MSK;
    delete process.env.LEADERBOARD_EVENING_TIME_MSK;
    delete process.env.DAILY_SUMMARY_TIME_MSK;
  }
});

test("invalid configured time is rejected", () => {
  process.env.DAILY_SUMMARY_TIME_MSK = "25:00";
  try {
    assert.throws(() => getGroupFeedSchedule(defaults), /DAILY_SUMMARY_TIME_MSK must use HH:MM/);
  } finally {
    delete process.env.DAILY_SUMMARY_TIME_MSK;
  }
});
