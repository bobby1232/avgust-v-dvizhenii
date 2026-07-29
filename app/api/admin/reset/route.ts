import { timingSafeEqual } from "node:crypto";
import { databaseErrorResponse, ensureSchema, getSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secretsMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function DELETE(request: Request) {
  try {
    const configuredSecret = process.env.ADMIN_SECRET;
    const suppliedSecret = request.headers.get("x-admin-secret") ?? "";

    if (!configuredSecret) {
      return Response.json(
        { error: "В Railway не задана переменная ADMIN_SECRET." },
        { status: 503 },
      );
    }

    if (!secretsMatch(suppliedSecret, configuredSecret)) {
      return Response.json({ error: "Неверный код администратора." }, { status: 401 });
    }

    await ensureSchema();
    const sql = getSql();
    await sql`TRUNCATE TABLE activities, participants RESTART IDENTITY CASCADE`;

    return Response.json({ ok: true });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
