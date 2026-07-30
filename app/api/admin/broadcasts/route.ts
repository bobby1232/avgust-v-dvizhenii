import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  activityDays,
  auditLogs,
  broadcastResults,
  broadcastRuns,
  users,
} from "@/db/schema";
import { ApiError, jsonError, requireAdmin, zodDetails } from "@/lib/api";
import { activeCompetition, registeredUser } from "@/lib/data";
import { getCompetitionDate } from "@/lib/competition-time";
import { sendTelegramMessage } from "@/lib/telegram-bot";

const broadcastSchema = z.object({
  audience: z.enum(["all_active", "without_today", "minimum_active_days"]),
  minimumActiveDays: z.number().int().min(0).max(31).optional(),
  message: z.string().trim().min(1).max(4000),
  preview: z.boolean().default(true),
  comment: z.string().trim().min(1).max(500),
}).superRefine((value, context) => {
  if (value.audience === "minimum_active_days" && value.minimumActiveDays === undefined) {
    context.addIssue({ code: "custom", path: ["minimumActiveDays"], message: "Укажите минимум активных дней" });
  }
});

async function audience(competitionId: number, today: string, kind: string, minimum = 0) {
  const activeUsers = await db.select({
    id: users.id,
    telegramId: users.telegramId,
    displayName: users.displayName,
  }).from(users).where(and(eq(users.isActive, true), eq(users.notificationsEnabled, true)));
  const days = await db.select({ userId: activityDays.userId, date: activityDays.activityDate })
    .from(activityDays).where(eq(activityDays.competitionId, competitionId));
  const counts = new Map<number, number>();
  const todayUsers = new Set<number>();
  for (const day of days) {
    counts.set(day.userId, (counts.get(day.userId) ?? 0) + 1);
    if (day.date === today) todayUsers.add(day.userId);
  }
  if (kind === "without_today") return activeUsers.filter((user) => !todayUsers.has(user.id));
  if (kind === "minimum_active_days") return activeUsers.filter((user) => (counts.get(user.id) ?? 0) >= minimum);
  return activeUsers;
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const parsed = broadcastSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, "Проверьте рассылку", "VALIDATION_ERROR", zodDetails(parsed.error));
    const competition = await activeCompetition();
    const recipients = await audience(
      competition.id,
      getCompetitionDate(new Date(), competition.timezone),
      parsed.data.audience,
      parsed.data.minimumActiveDays,
    );
    if (parsed.data.preview) {
      return NextResponse.json({
        preview: true,
        recipients: recipients.map(({ id, displayName }) => ({ id, displayName })),
        count: recipients.length,
      });
    }
    const actorUser = await registeredUser(actor.id);
    const [run] = await db.insert(broadcastRuns).values({
      competitionId: competition.id,
      audience: parsed.data.audience,
      minimumActiveDays: parsed.data.minimumActiveDays ?? null,
      message: parsed.data.message,
      createdBy: actorUser.id,
      status: "pending",
    }).returning();
    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      try {
        const result = await sendTelegramMessage(recipient.telegramId, parsed.data.message);
        await db.insert(broadcastResults).values({
          broadcastId: run.id,
          userId: recipient.id,
          status: "sent",
          telegramMessageId: String(result.message_id),
        });
        sent += 1;
      } catch (error) {
        await db.insert(broadcastResults).values({
          broadcastId: run.id,
          userId: recipient.id,
          status: "failed",
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown Telegram error",
        });
        failed += 1;
      }
    }
    await db.update(broadcastRuns).set({ status: failed ? "completed_with_errors" : "sent" })
      .where(eq(broadcastRuns.id, run.id));
    await db.insert(auditLogs).values({
      actorTelegramId: actor.id,
      action: "broadcast.sent",
      entityType: "broadcast",
      entityId: String(run.id),
      newValue: { audience: parsed.data.audience, recipientCount: recipients.length, sent, failed },
      comment: parsed.data.comment,
    });
    return NextResponse.json({ id: run.id, recipients: recipients.length, sent, failed });
  } catch (error) {
    return jsonError(error, "admin.broadcast.post");
  }
}
