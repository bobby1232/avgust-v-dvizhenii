import {
  DEFAULT_COMPETITION_TIMEZONE,
  getCompetitionDate,
  getElapsedCompetitionDates,
  isCompetitionDay,
  shiftCompetitionDate,
  type CompetitionPeriod,
} from "./competition-time.ts";

export type Progress = {
  activeDays: number;
  currentStreak: number;
  maxStreak: number;
  missedDays: number;
  checkedInToday: boolean;
  remainingToDraw: number;
  remainingToPerfectMonth: number;
};

export function calculateProgress(
  activityDates: string[],
  competition: CompetitionPeriod,
  now = new Date(),
): Progress {
  const dates = [...new Set(activityDates)]
    .filter((date) => isCompetitionDay(date, competition))
    .sort();
  const dateSet = new Set(dates);
  let maxStreak = 0;
  let run = 0;
  let previous = "";
  for (const date of dates) {
    run = !previous || shiftCompetitionDate(previous, 1) === date ? run + 1 : 1;
    maxStreak = Math.max(maxStreak, run);
    previous = date;
  }

  const timezone = competition.timezone || DEFAULT_COMPETITION_TIMEZONE;
  const today = getCompetitionDate(now, timezone);
  const checkedInToday = dateSet.has(today);
  let cursor = checkedInToday ? today : shiftCompetitionDate(today, -1);
  let currentStreak = 0;
  while (dateSet.has(cursor)) {
    currentStreak += 1;
    cursor = shiftCompetitionDate(cursor, -1);
  }

  const elapsed = getElapsedCompetitionDates(competition, now);
  const completed = today > (competition.endDate || today)
    ? elapsed
    : elapsed.filter((date) => date < today);
  const completedActiveDays = completed.filter((date) => dateSet.has(date)).length;

  return {
    activeDays: dates.length,
    currentStreak,
    maxStreak,
    missedDays: Math.max(0, completed.length - completedActiveDays),
    checkedInToday,
    remainingToDraw: Math.max(0, 20 - dates.length),
    remainingToPerfectMonth: Math.max(0, elapsed.length - dates.length),
  };
}
