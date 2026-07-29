import { databaseErrorResponse, ensureSchema, getSql, moscowDateString } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckinInput = {
  participantId?: unknown;
  activityType?: unknown;
  note?: unknown;
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const sql = getSql();
    const input = (await request.json()) as CheckinInput;

    const participantId = stringValue(input.participantId);
    const activityType = stringValue(input.activityType);
    const note = stringValue(input.note);
    const today = moscowDateString();

    if (!participantId) {
      return Response.json({ error: "Сначала зарегистрируйтесь." }, { status: 400 });
    }

    if (!activityType || activityType.length > 60) {
      return Response.json({ error: "Выберите вид активности." }, { status: 400 });
    }

    if (note.length > 200) {
      return Response.json({ error: "Комментарий не должен превышать 200 символов." }, { status: 400 });
    }

    const [participant] = await sql<{ id: string }[]>`
      SELECT id FROM participants WHERE id = ${participantId} LIMIT 1
    `;

    if (!participant) {
      return Response.json({ error: "Регистрация не найдена. Зарегистрируйтесь заново." }, { status: 404 });
    }

    const inserted = await sql<{ id: string }[]>`
      INSERT INTO activities (participant_id, activity_date, activity_type, note)
      VALUES (${participantId}, ${today}::DATE, ${activityType}, ${note || null})
      ON CONFLICT (participant_id, activity_date) DO NOTHING
      RETURNING id::TEXT
    `;

    if (inserted.length === 0) {
      return Response.json({ error: "Сегодня активность уже засчитана." }, { status: 409 });
    }

    return Response.json({ ok: true, date: today }, { status: 201 });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
