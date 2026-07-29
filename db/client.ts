import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

type Database = NodePgDatabase<typeof schema>;

type GlobalDatabaseState = typeof globalThis & {
  avgustPool?: pg.Pool;
  avgustDb?: Database;
};

const globalDb = globalThis as GlobalDatabaseState;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is not configured");
  return value;
}

export function getPool(): pg.Pool {
  if (globalDb.avgustPool) return globalDb.avgustPool;

  const pool = new pg.Pool({
    connectionString: databaseUrl(),
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  });

  globalDb.avgustPool = pool;
  return pool;
}

export function getDb(): Database {
  if (globalDb.avgustDb) return globalDb.avgustDb;

  const database = drizzle(getPool(), { schema });
  globalDb.avgustDb = database;
  return database;
}

export const db = new Proxy({} as Database, {
  get(_target, property) {
    const database = getDb();
    const value = Reflect.get(database, property, database);
    return typeof value === "function" ? value.bind(database) : value;
  },
});
