import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, customType, date, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

const bigintString = customType<{ data: string; driverData: string }>({
  dataType() {
    return "bigint";
  },
});

export const userRole = pgEnum("user_role", ["participant", "admin"]);

export const competitions = pgTable("competitions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("competitions_one_active_idx").on(table.isActive).where(sql`${table.isActive} = true`)]);

export const users = pgTable("users", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  telegramId: bigintString("telegram_id").notNull().unique(),
  telegramUsername: varchar("telegram_username", { length: 64 }),
  firstName: varchar("first_name", { length: 128 }),
  lastName: varchar("last_name", { length: 128 }),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  department: varchar("department", { length: 120 }),
  role: userRole("role").notNull().default("participant"),
  isActive: boolean("is_active").notNull().default(true),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("users_registered_at_idx").on(table.registeredAt)]);

export const activities = pgTable("activities", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  competitionId: bigint("competition_id", { mode: "number" }).notNull().references(() => competitions.id, { onDelete: "cascade" }),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  activityDate: date("activity_date", { mode: "string" }).notNull(),
  activityType: varchar("activity_type", { length: 32 }).notNull(),
  description: varchar("description", { length: 300 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("activities_user_id_idx").on(table.userId),
  index("activities_competition_id_idx").on(table.competitionId),
  index("activities_date_idx").on(table.activityDate),
  uniqueIndex("activities_user_day_idx").on(table.competitionId, table.userId, table.activityDate),
]);

export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorTelegramId: bigintString("actor_telegram_id"),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }),
  entityId: text("entity_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});