import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { activityTypes, auditLogs, contestSettings, weeklyThemes } from "@/db/schema";
import { ApiError, jsonError, requireAdmin, zodDetails } from "@/lib/api";
import { activeCompetition } from "@/lib/data";

const settingsSchema = z.object({
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  remindersEnabled: z.boolean().optional(),
  reportChatId: z.string().trim().nullable().optional(),
  weeklyReportEnabled: z.boolean().optional(),
  groupFeedEnabled: z.boolean().optional(),
  activityDigestEnabled: z.boolean().optional(),
  publishEachActivityEnabled: z.boolean().optional(),
  activityDigestIntervalMinutes: z.number().int().min(1).max(120).optional(),
  achievementAnnouncementsEnabled: z.boolean().optional(),
  leaderboardAnnouncementsEnabled: z.boolean().optional(),
  leaderboardDayTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  leaderboardEveningTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  dailySummaryEnabled: z.boolean().optional(),
  dailySummaryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  totalGoal: z.number().int().positive().nullable().optional(),
  nextGroupWorkout: z.string().trim().max(500).nullable().optional(),
  comment: z.string().trim().min(1).max(500),
});

export async function GET() {
  try {
    await requireAdmin();
    const competition = await activeCompetition();
    const [settings, themes, types] = await Promise.all([
      db.select().from(contestSettings).where(eq(contestSettings.competitionId, competition.id)).limit(1),
      db.select().from(weeklyThemes).where(eq(weeklyThemes.competitionId, competition.id)),
      db.select().from(activityTypes).orderBy(activityTypes.sortOrder),
    ]);
    return NextResponse.json({ settings: settings[0] ?? null, themes, activityTypes: types });
  } catch (error) {
    return jsonError(error, "admin.settings.get");
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireAdmin();
    const parsed = settingsSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, "Проверьте настройки", "VALIDATION_ERROR", zodDetails(parsed.error));
    const competition = await activeCompetition();
    const [oldValue] = await db.select().from(contestSettings)
      .where(eq(contestSettings.competitionId, competition.id)).limit(1);
    const { comment, reminderTime, leaderboardDayTime, leaderboardEveningTime, dailySummaryTime, ...changes } = parsed.data;
    const values = { ...changes, ...(reminderTime ? { reminderTime: `${reminderTime}:00` } : {}),
      ...(leaderboardDayTime ? { leaderboardDayTime: `${leaderboardDayTime}:00` } : {}),
      ...(leaderboardEveningTime ? { leaderboardEveningTime: `${leaderboardEveningTime}:00` } : {}),
      ...(dailySummaryTime ? { dailySummaryTime: `${dailySummaryTime}:00` } : {}), updatedAt: new Date() };
    const [settings] = oldValue
      ? await db.update(contestSettings).set(values).where(eq(contestSettings.id, oldValue.id)).returning()
      : await db.insert(contestSettings).values({ competitionId: competition.id, ...values }).returning();
    await db.insert(auditLogs).values({
      actorTelegramId: actor.id,
      action: "admin.settings.updated",
      entityType: "contest_settings",
      entityId: String(settings.id),
      oldValue: oldValue ?? null,
      newValue: settings,
      comment,
    });
    await db.insert(auditLogs).values({ actorTelegramId: actor.id, action: "GROUP_FEED_SETTINGS_UPDATED",
      entityType: "contest_settings", entityId: String(settings.id),
      payload: { competitionId: competition.id, publicationType: "settings", result: "updated" } });
    return NextResponse.json({ settings });
  } catch (error) {
    return jsonError(error, "admin.settings.patch");
  }
}
