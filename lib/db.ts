import postgres from "postgres";

type SqlClient = ReturnType<typeof postgres>;

declare global {
  // eslint-disable-next-line no-var
  var avgustSql: SqlClient | undefined;
  // eslint-disable-next-line no-var
  var avgustSchemaReady: Promise<void> | undefined;
}

export class DatabaseUnavailableError extends Error {
  constructor() {
    super("DATABASE_URL is not configured");
    this.name = "DatabaseUnavailableError";
  }
}

export function getSql(): SqlClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new DatabaseUnavailableError();

  if (!globalThis.avgustSql) {
    globalThis.avgustSql = postgres(databaseUrl, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }

  return globalThis.avgustSql;
}

export async function ensureSchema(): Promise<void> {
  if (!globalThis.avgustSchemaReady) {
    const sql = getSql();
    globalThis.avgustSchemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS participants (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          telegram_username TEXT,
          telegram_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS participants_telegram_username_unique
        ON participants (LOWER(telegram_username))
        WHERE telegram_username IS NOT NULL
      `;

      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS participants_telegram_id_unique
        ON participants (telegram_id)
        WHERE telegram_id IS NOT NULL
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS activities (
          id BIGSERIAL PRIMARY KEY,
          participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
          activity_date DATE NOT NULL,
          activity_type TEXT NOT NULL,
          note TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (participant_id, activity_date)
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS activities_date_idx
        ON activities (activity_date DESC)
      `;
    })().catch((error) => {
      globalThis.avgustSchemaReady = undefined;
      throw error;
    });
  }

  await globalThis.avgustSchemaReady;
}

export function moscowDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function databaseErrorResponse(error: unknown): Response {
  console.error(error);

  if (error instanceof DatabaseUnavailableError) {
    return Response.json(
      {
        error: "База данных не подключена. Добавьте PostgreSQL в Railway и передайте DATABASE_URL в сервис приложения.",
        code: "DATABASE_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  return Response.json(
    { error: "Не удалось выполнить операцию с базой данных." },
    { status: 500 },
  );
}
