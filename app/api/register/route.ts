import { randomUUID } from "node:crypto";
import { databaseErrorResponse, ensureSchema, getSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RegistrationInput = {
  name?: unknown;
  telegramUsername?: unknown;
  telegramId?: unknown;
};

type ParticipantRow = {
  id: string;
  name: string;
  telegram_username: string | null;
};

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const sql = getSql();
    const input = (await request.json()) as RegistrationInput;

    const name = normalizeOptionalString(input.name);
    const telegramUsername = normalizeOptionalString(input.telegramUsername)?.replace(/^@/, "") ?? null;
    const telegramId = normalizeOptionalString(input.telegramId);

    if (!name || name.length < 2 || name.length > 80) {
      return Response.json({ error: "Укажите имя длиной от 2 до 80 символов." }, { status: 400 });
    }

    if (telegramUsername && !/^[A-Za-z0-9_]{5,32}$/.test(telegramUsername)) {
      return Response.json({ error: "Telegram username указан некорректно." }, { status: 400 });
    }

    if (telegramId && !/^\d{1,30}$/.test(telegramId)) {
      return Response.json({ error: "Telegram ID указан некорректно." }, { status: 400 });
    }

    let existing: ParticipantRow | undefined;

    if (telegramId) {
      [existing] = await sql<ParticipantRow[]>`
        SELECT id, name, telegram_username
        FROM participants
        WHERE telegram_id = ${telegramId}
        LIMIT 1
      `;
    }

    if (!existing && telegramUsername) {
      [existing] = await sql<ParticipantRow[]>`
        SELECT id, name, telegram_username
        FROM participants
        WHERE LOWER(telegram_username) = LOWER(${telegramUsername})
        LIMIT 1
      `;
    }

    if (existing) {
      const [updated] = await sql<ParticipantRow[]>`
        UPDATE participants
        SET
          name = ${name},
          telegram_username = COALESCE(${telegramUsername}, telegram_username),
          telegram_id = COALESCE(${telegramId}, telegram_id)
        WHERE id = ${existing.id}
        RETURNING id, name, telegram_username
      `;

      return Response.json({
        participant: {
          id: updated.id,
          name: updated.name,
          telegramUsername: updated.telegram_username,
        },
        restored: true,
      });
    }

    const [created] = await sql<ParticipantRow[]>`
      INSERT INTO participants (id, name, telegram_username, telegram_id)
      VALUES (${randomUUID()}, ${name}, ${telegramUsername}, ${telegramId})
      RETURNING id, name, telegram_username
    `;

    return Response.json(
      {
        participant: {
          id: created.id,
          name: created.name,
          telegramUsername: created.telegram_username,
        },
        restored: false,
      },
      { status: 201 },
    );
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
