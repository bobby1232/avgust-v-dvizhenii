import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs, users } from "@/db/schema";
import { requireSession, jsonError, ApiError, zodDetails } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { isAdminTelegramId } from "@/lib/telegram";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const parsed = registerSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError(400, "Проверьте имя и подразделение", "VALIDATION_ERROR", zodDetails(parsed.error));
    }
    const role = isAdminTelegramId(session.id) ? "admin" : "participant";
    const [inserted] = await db.insert(users).values({
      telegramId: session.id,
      telegramUsername: session.username,
      firstName: session.firstName,
      lastName: session.lastName,
      displayName: parsed.data.displayName,
      department: parsed.data.department || null,
      role,
    }).onConflictDoNothing({ target: users.telegramId }).returning();
    const [user] = inserted ? [inserted] : await db.select().from(users)
      .where(eq(users.telegramId, session.id)).limit(1);
    if (!user) throw new ApiError(500, "Не удалось создать профиль", "REGISTRATION_FAILED");
    if (inserted) {
      await db.insert(auditLogs).values({
        actorTelegramId: session.id,
        action: "user.registered",
        entityType: "user",
        entityId: String(user.id),
        newValue: user,
      });
    }
    return NextResponse.json({ user, created: Boolean(inserted) }, { status: inserted ? 201 : 200 });
  } catch (error) {
    return jsonError(error, "register");
  }
}
