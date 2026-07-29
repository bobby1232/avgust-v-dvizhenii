import { and, asc, count, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { activities, competitions, users } from "@/db/schema";
import { ApiError } from "./api";

export async function activeCompetition() {
  const [competition] = await db.select().from(competitions).where(eq(competitions.isActive, true)).limit(1);
  if (!competition) throw new ApiError(409, "Активный конкурс не найден", "NO_ACTIVE_COMPETITION");
  return competition;
}
export async function registeredUser(telegramId: string) {
  const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
  if (!user) throw new ApiError(409, "Сначала пройдите регистрацию", "NOT_REGISTERED");
  return user;
}
export function streaks(dates: string[], today = new Date().toISOString().slice(0, 10)) {
  const unique = [...new Set(dates)].sort(); let max = 0; let run = 0; let previous = "";
  for (const date of unique) { const diff = previous ? (Date.parse(date) - Date.parse(previous)) / 86_400_000 : 0; run = !previous || diff === 1 ? run + 1 : 1; max = Math.max(max, run); previous = date; }
  let current = 0; let cursor = today;
  const set = new Set(unique); if (!set.has(cursor)) cursor = new Date(Date.parse(cursor) - 86_400_000).toISOString().slice(0, 10);
  while (set.has(cursor)) { current++; cursor = new Date(Date.parse(cursor) - 86_400_000).toISOString().slice(0, 10); }
  return { current, max };
}
export async function userStats(userId: number, competitionId: number) {
  const rows = await db.select({ date: activities.activityDate }).from(activities).where(and(eq(activities.userId, userId), eq(activities.competitionId, competitionId))).orderBy(asc(activities.activityDate));
  return { activeDays: rows.length, ...streaks(rows.map((row) => row.date)), checkedInToday: rows.some((row) => row.date === new Date().toISOString().slice(0, 10)) };
}
export async function communityData() {
  const competition = await activeCompetition();
  const rows = await db.select({ id: users.id, displayName: users.displayName, department: users.department, registeredAt: users.registeredAt, isActive: users.isActive, date: activities.activityDate })
    .from(users).leftJoin(activities, and(eq(activities.userId, users.id), eq(activities.competitionId, competition.id))).orderBy(desc(users.registeredAt), asc(activities.activityDate));
  const map = new Map<number, { id: number; displayName: string; department: string | null; registeredAt: Date; isActive: boolean; dates: string[] }>();
  for (const row of rows) { const item = map.get(row.id) ?? { id: row.id, displayName: row.displayName, department: row.department, registeredAt: row.registeredAt, isActive: row.isActive, dates: [] }; if (row.date) item.dates.push(row.date); map.set(row.id, item); }
  const participants = [...map.values()].map(({ dates, ...user }) => ({ ...user, activeDays: dates.length, ...streaks(dates) }));
  return { competition, registeredParticipants: participants.length, activeParticipants: participants.filter((p) => p.activeDays > 0).length, totalActiveDays: participants.reduce((sum, p) => sum + p.activeDays, 0), participants };
}
export async function adminStats() {
  const community = await communityData(); const today = new Date().toISOString().slice(0, 10);
  const [{ value: checkinsToday }] = await db.select({ value: count() }).from(activities).where(and(eq(activities.competitionId, community.competition.id), eq(activities.activityDate, today)));
  return { totalRegistrations: community.registeredParticipants, activeParticipants: community.activeParticipants, checkinsToday, totalActivities: community.totalActiveDays };
}
