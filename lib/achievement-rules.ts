import { shiftCompetitionDate } from "./competition-time.ts";

export type AchievementActivity = {
  activityDate: string;
  activityType: string;
  createdAt?: Date;
};

export const automaticActivityAchievementCodes = [
  "FIRST_SUP",
  "RUNNER",
  "WORKOUT",
  "EARLY_START",
  "FAMILY",
  "WITH_FRIEND",
  "RECOVERY",
  "TRY_NEW",
  "WEEKEND",
  "RETURN",
] as const;

function hasWeekendPair(dates: Set<string>): boolean {
  for (const date of dates) {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (day === 6 && dates.has(shiftCompetitionDate(date, 1))) return true;
  }
  return false;
}

function hasReturnStreak(dates: string[]): boolean {
  const sorted = [...new Set(dates)].sort();
  let hadGapAfterActivity = false;
  let streak = 0;
  let previous = "";

  for (const date of sorted) {
    if (!previous) {
      streak = 1;
      previous = date;
      continue;
    }

    if (shiftCompetitionDate(previous, 1) === date) {
      streak += 1;
    } else {
      // A return starts only after a real break that follows an earlier activity.
      // Starting the competition late is not treated as a return.
      hadGapAfterActivity = true;
      streak = 1;
    }

    if (hadGapAfterActivity && streak >= 7) return true;
    previous = date;
  }
  return false;
}

export function eligibleActivityAchievementCodes(
  rows: AchievementActivity[],
  _competitionStart: string,
  timezone = "Europe/Moscow",
): string[] {
  const types = new Set(rows.map((row) => row.activityType));
  const dates = new Set(rows.map((row) => row.activityDate));
  const codes = new Set<string>();
  if (types.has("SUP")) codes.add("FIRST_SUP");
  if (types.has("Бег")) codes.add("RUNNER");
  if (types.has("Турник / воркаут")) codes.add("WORKOUT");
  if (types.has("Семейная тренировка")) codes.add("FAMILY");
  if (types.has("Тренировка с другом")) codes.add("WITH_FRIEND");
  if (types.has("Йога") || types.has("Растяжка")) codes.add("RECOVERY");
  if (types.size >= 2) codes.add("TRY_NEW");
  if (hasWeekendPair(dates)) codes.add("WEEKEND");
  if (hasReturnStreak([...dates])) codes.add("RETURN");
  if (rows.some((row) => row.createdAt && Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(row.createdAt)) < 8)) codes.add("EARLY_START");
  return [...codes];
}
