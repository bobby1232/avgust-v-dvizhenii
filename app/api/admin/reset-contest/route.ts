import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs, competitions, contestSettings, weeklyThemes } from "@/db/schema";
import { ApiError, jsonError, requireAdmin, zodDetails } from "@/lib/api";
import { createCompetitionSchema, resetSchema } from "@/lib/validation";
import { shiftCompetitionDate } from "@/lib/competition-time";

function themes(startDate: string, endDate: string) {
  const names = ["Начинаем", "Пробуем новое", "Двигаемся вместе", "Не останавливаемся", "Финишируем"];
  const rows = [];
  let start = startDate;
  for (const name of names) {
    if (start > endDate) break;
    const end = name === names.at(-1) ? endDate : [shiftCompetitionDate(start, 6), endDate].sort()[0];
    rows.push({ startDate: start, endDate: end, title: name });
    start = shiftCompetitionDate(end, 1);
  }
  return rows;
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const body = await request.json();

    if (body?.confirmation !== undefined) {
      if (process.env.NODE_ENV === "production" || process.env.ALLOW_DESTRUCTIVE_RESET !== "true") {
        throw new ApiError(403, "Разрушительный сброс отключён", "DESTRUCTIVE_RESET_DISABLED");
      }
      const parsedReset = resetSchema.safeParse(body);
      if (!parsedReset.success) throw new ApiError(400, "Введите фразу «НАЧАТЬ ЗАНОВО»", "INVALID_CONFIRMATION");
      throw new ApiError(410, "Удаление данных больше не поддерживается. Создайте новый конкурс.", "RESET_REMOVED");
    }

    const parsed = createCompetitionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "Проверьте параметры конкурса", "VALIDATION_ERROR", zodDetails(parsed.error));
    }
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(8122026)`);
      const [previous] = await tx.select().from(competitions)
        .where(eq(competitions.isActive, true)).limit(1);
      if (previous) {
        await tx.update(competitions).set({ isActive: false, updatedAt: new Date() })
          .where(eq(competitions.id, previous.id));
      }
      const [competition] = await tx.insert(competitions).values({
        name: parsed.data.name,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        timezone: parsed.data.timezone,
        isActive: true,
      }).returning();
      await tx.insert(contestSettings).values({
        competitionId: competition.id,
        reminderTime: `${parsed.data.reminderTime}:00`,
      });
      await tx.insert(weeklyThemes).values(themes(competition.startDate, competition.endDate!).map((theme) => ({
        competitionId: competition.id,
        ...theme,
      })));
      await tx.insert(auditLogs).values({
        actorTelegramId: actor.id,
        action: "competition.created",
        entityType: "competition",
        entityId: String(competition.id),
        oldValue: previous ?? null,
        newValue: competition,
        comment: parsed.data.comment,
      });
      return competition;
    });
    return NextResponse.json({ competition: created }, { status: 201 });
  } catch (error) {
    return jsonError(error, "admin.competition.create");
  }
}
