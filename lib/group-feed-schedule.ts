export const GROUP_FEED_TIMEZONE = "Europe/Moscow";

export type GroupFeedScheduleDefaults = {
  leaderboardDayTime: string;
  leaderboardEveningTime: string;
  dailySummaryTime: string;
};

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function configuredTime(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  if (!value) return fallback.slice(0, 5);
  if (!timePattern.test(value)) {
    throw new Error(`${name} must use HH:MM (Moscow time)`);
  }
  return value;
}

export function getGroupFeedSchedule(defaults: GroupFeedScheduleDefaults) {
  return {
    leaderboardDayTime: configuredTime("LEADERBOARD_DAY_TIME_MSK", defaults.leaderboardDayTime),
    leaderboardEveningTime: configuredTime("LEADERBOARD_EVENING_TIME_MSK", defaults.leaderboardEveningTime),
    dailySummaryTime: configuredTime("DAILY_SUMMARY_TIME_MSK", defaults.dailySummaryTime),
  };
}

export function getMoscowTime(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: GROUP_FEED_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.hour}:${value.minute}`;
}
