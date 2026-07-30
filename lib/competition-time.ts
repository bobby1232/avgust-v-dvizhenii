export const DEFAULT_COMPETITION_TIMEZONE = "Europe/Moscow";

export type CompetitionPeriod = {
  startDate: string;
  endDate: string | null;
  timezone?: string | null;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function skipsCompetitionStartDateCheck(): boolean {
  return process.env.SKIP_COMPETITION_START_DATE_CHECK === "true";
}

function assertDate(value: string): void {
  if (!datePattern.test(value)) throw new Error(`Invalid competition date: ${value}`);
}

export function getCompetitionDate(
  now = new Date(),
  timezone = DEFAULT_COMPETITION_TIMEZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function getCompetitionDateTime(
  now = new Date(),
  timezone = DEFAULT_COMPETITION_TIMEZONE,
): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(
    Number(value.year),
    Number(value.month) - 1,
    Number(value.day),
    Number(value.hour),
    Number(value.minute),
    Number(value.second),
  ));
}

export function isCompetitionDay(date: string, competition: CompetitionPeriod): boolean {
  assertDate(date);
  const hasStarted = skipsCompetitionStartDateCheck() || date >= competition.startDate;
  return hasStarted && (!competition.endDate || date <= competition.endDate);
}

export function shiftCompetitionDate(date: string, days: number): string {
  assertDate(date);
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getElapsedCompetitionDates(
  competition: CompetitionPeriod,
  now = new Date(),
): string[] {
  const today = getCompetitionDate(now, competition.timezone || DEFAULT_COMPETITION_TIMEZONE);
  const last = competition.endDate && competition.endDate < today ? competition.endDate : today;
  const first = skipsCompetitionStartDateCheck() && today < competition.startDate
    ? today
    : competition.startDate;
  if (last < first) return [];
  const dates: string[] = [];
  for (let date = first; date <= last; date = shiftCompetitionDate(date, 1)) {
    dates.push(date);
  }
  return dates;
}

export function competitionPhase(
  competition: CompetitionPeriod,
  now = new Date(),
): "before" | "active" | "after" {
  const today = getCompetitionDate(now, competition.timezone || DEFAULT_COMPETITION_TIMEZONE);
  if (!skipsCompetitionStartDateCheck() && today < competition.startDate) return "before";
  if (competition.endDate && today > competition.endDate) return "after";
  return "active";
}
