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
import { activeCompetition, communityData, favoriteActivity } from "@/lib/data";
import { safeCsvCell } from "@/lib/csv";

function dateCell(value: Date | string | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

function section(name: string, headers: string[], rows: unknown[][]): string {
  return [
    name,
    headers.map(safeCsvCell).join(";"),
    ...rows.map((row) => row.map(safeCsvCell).join(";")),
    "",
  ].join("\r\n");
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const format = new URL(request.url).searchParams.get("format") ?? "csv";
    if (format !== "csv") throw new ApiError(400, "MVP поддерживает формат csv", "UNSUPPORTED_FORMAT");
    const competition = await activeCompetition();
    const [community, participantProfiles, activityRows, achievementRows, audits] = await Promise.all([
      communityData(true),
      db.select({
        id: users.id,
        telegramId: users.telegramId,
        telegramUsername: users.telegramUsername,
      }).from(users),
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
    const approvedByUser = new Map<number, Array<{ activityType: string; customActivityName: string | null; durationMinutes: number }>>();
    const profileById = new Map(participantProfiles.map((profile) => [profile.id, profile]));
    for (const { activity } of activityRows) {
      if (activity.status !== "approved") continue;
      approvedByUser.set(activity.userId, [
        ...(approvedByUser.get(activity.userId) ?? []),
        {
          activityType: activity.activityType,
          customActivityName: activity.customActivityName,
          durationMinutes: activity.durationMinutes,
        },
      ]);
    }
    const participantRows = community.participants.map((participant) => {
      const approved = approvedByUser.get(participant.id) ?? [];
      const profile = profileById.get(participant.id);
      const totalDurationMinutes = approved.reduce((sum, item) => sum + item.durationMinutes, 0);
      return [
        profile?.telegramId, profile?.telegramUsername, participant.displayName,
        participant.department, dateCell(participant.registeredAt), participant.isActive,
        participant.notificationsEnabled, participant.activeDays, participant.currentStreak, participant.maxStreak,
        participant.missedDays, participant.achievementCount, favoriteActivity(approved), totalDurationMinutes,
        participant.isActive && participant.activeDays >= 20, participant.activeDays === 31,
      ];
    });
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
