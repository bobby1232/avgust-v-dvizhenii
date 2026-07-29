import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const globalDb = globalThis as typeof globalThis & { avgustPool?: pg.Pool };

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is not configured");
  return value;
}

export const pool = globalDb.avgustPool ?? new pg.Pool({
  connectionString: databaseUrl(),
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

if (process.env.NODE_ENV !== "production") globalDb.avgustPool = pool;
export const db = drizzle(pool, { schema });
