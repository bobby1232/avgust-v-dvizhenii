import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs, competitions, contestSettings } from "@/db/schema";
import { requireAdmin, jsonError, ApiError } from "@/lib/api";
import { resetSchema } from "@/lib/validation";
export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    if (!resetSchema.safeParse(await request.json()).success) throw new ApiError(400, "Введите фразу «НАЧАТЬ ЗАНОВО»", "INVALID_CONFIRMATION");
    const competition = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(8122026)`);
      const [existing] = await tx.select().from(competitions).where(eq(competitions.startDate, "2026-11-01")).limit(1);
      if (existing) return existing;
      const [previous] = await tx.select().from(competitions).where(eq(competitions.isActive, true)).limit(1);
      await tx.update(competitions).set({ isActive: false, updatedAt: new Date() }).where(eq(competitions.isActive, true));
      const [created] = await tx.insert(competitions).values({ name: "Ноябрь в движении", startDate: "2026-11-01", endDate: "2026-11-30", timezone: "Europe/Moscow", isActive: true }).returning();
      const [settings] = previous ? await tx.select().from(contestSettings).where(eq(contestSettings.competitionId, previous.id)).limit(1) : [];
      await tx.insert(contestSettings).values({ competitionId: created.id, minimumDurationMinutes: settings?.minimumDurationMinutes ?? 20, reminderTime: settings?.reminderTime ?? "20:00:00", reportChatId: settings?.reportChatId, remindersEnabled: settings?.remindersEnabled ?? true, weeklyReportEnabled: settings?.weeklyReportEnabled ?? true });
      await tx.insert(auditLogs).values({ actorTelegramId: actor.id, action: "competition.created", entityType: "competition", entityId: String(created.id), payload: { previousCompetitionId: previous?.id, historyPreserved: true } });
      return created;
    });
    return NextResponse.json({ competition });
  } catch (error) { return jsonError(error, "admin.start"); }
}
