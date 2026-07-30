import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs, users } from "@/db/schema";
import { ApiError, requireAdmin, jsonError } from "@/lib/api";
import { communityData } from "@/lib/data";
import { adminUserPatchSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireAdmin();
    const { participants } = await communityData(true);
    return NextResponse.json({ users: participants });
  } catch (error) {
    return jsonError(error, "admin.users");
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireAdmin();
    const parsed = adminUserPatchSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, "Проверьте данные участника", "VALIDATION_ERROR");
    const [previous] = await db.select().from(users).where(eq(users.id, parsed.data.id)).limit(1);
    if (!previous) throw new ApiError(404, "Участник не найден", "USER_NOT_FOUND");
    const { id, comment, ...changes } = parsed.data;
    const [user] = await db.update(users).set({ ...changes, updatedAt: new Date() })
      .where(eq(users.id, id)).returning();
    await db.insert(auditLogs).values({
      actorTelegramId: actor.id,
      action: user.isActive === previous.isActive ? "admin.user.updated" : user.isActive ? "admin.user.enabled" : "admin.user.disabled",
      entityType: "user",
      entityId: String(id),
      oldValue: previous,
      newValue: user,
      comment: comment || null,
    });
    return NextResponse.json({ user });
  } catch (error) {
    return jsonError(error, "admin.users.patch");
  }
}
