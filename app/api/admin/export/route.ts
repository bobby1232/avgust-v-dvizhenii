import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activities,
  achievementDefinitions,
  auditLogs,
  userAchievements,
  users,
} from "@/db/schema";
import { ApiError, jsonError, requireAdmin } from "@/lib/api";
import { activeCompetition, userStats } from "@/lib/data";

function safeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function dateCell(value: Date | string | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

function section(name: string, headers: string[], rows: unknown[][]): string {
  return [
    name,
    headers.map(safeCell).join(";"),
    ...rows.map((row) => row.map(safeCell).join(";")),
    "",
  ].join("\r\n");
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const format = new URL(request.url).searchParams.get("format") ?? "csv";
    if (format !== "csv") throw new ApiError(400, "MVP поддерживает формат csv", "UNSUPPORTED_FORMAT");
    const competition = await activeCompetition();
    const [participants, activityRows, achievementRows, audits] = await Promise.all([
      db.select().from(users).orderBy(asc(users.displayName)),
      db.select({
        activity: activities,
        participant: users.displayName,
      }).from(activities).innerJoin(users, eq(activities.userId, users.id))
        .where(eq(activities.competitionId, competition.id)).orderBy(asc(activities.activityDate)),
      db.select({
        participant: users.displayName,
        code: achievementDefinitions.code,
        name: achievementDefinitions.name,
        awardedAt: userAchievements.awardedAt,
        source: userAchievements.source,
        awardedBy: userAchievements.awardedBy,
        revokedAt: userAchievements.revokedAt,
      }).from(userAchievements)
        .innerJoin(users, eq(userAchievements.userId, users.id))
        .innerJoin(achievementDefinitions, eq(userAchievements.achievementId, achievementDefinitions.id))
        .where(eq(userAchievements.competitionId, competition.id)),
      db.select().from(auditLogs).orderBy(asc(auditLogs.createdAt)),
    ]);
    const participantRows = await Promise.all(participants.map(async (participant) => {
      const stats = await userStats(participant.id, competition.id);
      return [
        participant.telegramId, participant.telegramUsername, participant.displayName,
        participant.department, dateCell(participant.registeredAt), participant.isActive,
        participant.notificationsEnabled, stats.activeDays, stats.currentStreak, stats.maxStreak,
        stats.missedDays, stats.achievementCount, stats.favoriteActivity, stats.totalDurationMinutes,
        participant.isActive && stats.activeDays >= 20, stats.activeDays === 31,
      ];
    }));
    const csv = "\uFEFF" + [
      section("Participants", [
        "telegram_id", "username", "display_name", "department", "registered_at", "is_active",
        "notifications_enabled", "active_days", "current_streak", "max_streak", "missed_days",
        "achievement_count", "favorite_activity", "total_duration_minutes", "eligible_for_draw", "perfect_month",
      ], participantRows),
      section("Activities", [
        "activity_id", "participant", "activity_date", "activity_type", "custom_activity_name",
        "duration_minutes", "description", "status", "evidence_type", "evidence_url", "created_at", "updated_at",
      ], activityRows.map(({ activity, participant }) => [
        activity.id, participant, dateCell(activity.activityDate), activity.activityType,
        activity.customActivityName, activity.durationMinutes, activity.description, activity.status,
        activity.evidenceType, activity.evidenceUrl, dateCell(activity.createdAt), dateCell(activity.updatedAt),
      ])),
      section("Achievements", [
        "participant", "achievement_code", "achievement_name", "awarded_at", "source", "awarded_by", "revoked_at",
      ], achievementRows.map((item) => [
        item.participant, item.code, item.name, dateCell(item.awardedAt), item.source,
        item.awardedBy, dateCell(item.revokedAt),
      ])),
      section("Audit", [
        "created_at", "actor", "action", "entity_type", "entity_id", "payload",
      ], audits.map((item) => [
        dateCell(item.createdAt), item.actorTelegramId, item.action, item.entityType,
        item.entityId, item.payload ?? { old: item.oldValue, new: item.newValue, comment: item.comment, result: item.result },
      ])),
    ].join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="gosup-games-${competition.startDate}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error, "admin.export");
  }
}
