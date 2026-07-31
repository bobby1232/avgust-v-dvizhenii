import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, customType, date, index, integer, jsonb, pgEnum, pgTable, text, time, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

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
  timezone: varchar("timezone", { length: 64 }).notNull().default("Europe/Moscow"),
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
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  botStartedAt: timestamp("bot_started_at", { withTimezone: true }),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("users_registered_at_idx").on(table.registeredAt)]);

export const activities = pgTable("activities", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  competitionId: bigint("competition_id", { mode: "number" }).notNull().references(() => competitions.id, { onDelete: "cascade" }),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  activityDate: date("activity_date", { mode: "string" }).notNull(),
  activityType: varchar("activity_type", { length: 120 }).notNull(),
  customActivityName: varchar("custom_activity_name", { length: 120 }),
  durationMinutes: integer("duration_minutes").notNull().default(20),
  description: varchar("description", { length: 300 }),
  evidenceType: varchar("evidence_type", { length: 32 }),
  evidenceUrl: varchar("evidence_url", { length: 1000 }),
  telegramFileId: varchar("telegram_file_id", { length: 512 }),
  status: varchar("status", { length: 16 }).notNull().default("approved"),
  moderationComment: varchar("moderation_comment", { length: 500 }),
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
  updatedBy: bigint("updated_by", { mode: "number" }).references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("activities_user_id_idx").on(table.userId),
  index("activities_competition_id_idx").on(table.competitionId),
  index("activities_date_idx").on(table.activityDate),
  index("activities_user_day_idx").on(table.competitionId, table.userId, table.activityDate),
]);

export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorTelegramId: bigintString("actor_telegram_id"),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }),
  entityId: text("entity_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  oldValue: jsonb("old_value").$type<Record<string, unknown>>(),
  newValue: jsonb("new_value").$type<Record<string, unknown>>(),
  comment: varchar("comment", { length: 500 }),
  result: varchar("result", { length: 32 }).notNull().default("success"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityTypes = pgTable("activity_types", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityDays = pgTable("activity_days", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  competitionId: bigint("competition_id", { mode: "number" }).notNull().references(() => competitions.id, { onDelete: "cascade" }),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  activityDate: date("activity_date", { mode: "string" }).notNull(),
  firstActivityId: bigint("first_activity_id", { mode: "number" }).references(() => activities.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("activity_days_competition_user_date_idx").on(table.competitionId, table.userId, table.activityDate),
  index("activity_days_user_idx").on(table.userId),
]);

export const achievementDefinitions = pgTable("achievement_definitions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  emoji: varchar("emoji", { length: 24 }).notNull(),
  category: varchar("category", { length: 64 }).notNull().default("streak"),
  triggerType: varchar("trigger_type", { length: 64 }).notNull(),
  triggerValue: integer("trigger_value"),
  isAutomatic: boolean("is_automatic").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userAchievements = pgTable("user_achievements", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  competitionId: bigint("competition_id", { mode: "number" }).notNull().references(() => competitions.id, { onDelete: "cascade" }),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  achievementId: bigint("achievement_id", { mode: "number" }).notNull().references(() => achievementDefinitions.id),
  awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
  awardedBy: bigint("awarded_by", { mode: "number" }).references(() => users.id),
  source: varchar("source", { length: 32 }).notNull().default("automatic"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: bigint("revoked_by", { mode: "number" }).references(() => users.id),
  revocationSource: varchar("revocation_source", { length: 32 }),
  comment: varchar("comment", { length: 500 }),
}, (table) => [
  uniqueIndex("user_achievements_unique_idx").on(table.competitionId, table.userId, table.achievementId),
  index("user_achievements_user_idx").on(table.userId),
]);

export const notificationLogs = pgTable("notification_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  competitionId: bigint("competition_id", { mode: "number" }).notNull().references(() => competitions.id, { onDelete: "cascade" }),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id, { onDelete: "cascade" }),
  notificationType: varchar("notification_type", { length: 64 }).notNull(),
  notificationDate: date("notification_date", { mode: "string" }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  telegramMessageId: bigintString("telegram_message_id"),
  errorMessage: varchar("error_message", { length: 500 }),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("notification_logs_unique_idx").on(table.competitionId, table.userId, table.notificationType, table.notificationDate),
]);

export const contestSettings = pgTable("contest_settings", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  competitionId: bigint("competition_id", { mode: "number" }).notNull().references(() => competitions.id, { onDelete: "cascade" }).unique(),
  minimumDurationMinutes: integer("minimum_duration_minutes").notNull().default(20),
  reminderTime: time("reminder_time").notNull().default("20:00:00"),
  reportChatId: bigintString("report_chat_id"),
  remindersEnabled: boolean("reminders_enabled").notNull().default(true),
  weeklyReportEnabled: boolean("weekly_report_enabled").notNull().default(true),
  groupFeedEnabled: boolean("group_feed_enabled").notNull().default(true),
  activityDigestEnabled: boolean("activity_digest_enabled").notNull().default(true),
  activityDigestIntervalMinutes: integer("activity_digest_interval_minutes").notNull().default(10),
  achievementAnnouncementsEnabled: boolean("achievement_announcements_enabled").notNull().default(true),
  leaderboardAnnouncementsEnabled: boolean("leaderboard_announcements_enabled").notNull().default(true),
  leaderboardDayTime: time("leaderboard_day_time").notNull().default("12:00:00"),
  leaderboardEveningTime: time("leaderboard_evening_time").notNull().default("20:30:00"),
  dailySummaryEnabled: boolean("daily_summary_enabled").notNull().default(true),
  dailySummaryTime: time("daily_summary_time").notNull().default("21:30:00"),
  totalGoal: integer("total_goal"),
  nextGroupWorkout: text("next_group_workout"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupFeedEvents = pgTable("group_feed_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  competitionId: bigint("competition_id", { mode: "number" }).notNull().references(() => competitions.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 32 }).notNull(),
  entityType: varchar("entity_type", { length: 32 }).notNull(),
  entityId: bigintString("entity_id").notNull(),
  dedupeKey: varchar("dedupe_key", { length: 200 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  telegramMessageId: bigintString("telegram_message_id"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  errorMessage: varchar("error_message", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("group_feed_events_dedupe_idx").on(table.dedupeKey),
  index("group_feed_events_ready_idx").on(table.status, table.availableAt),
]);

export const weeklyThemes = pgTable("weekly_themes", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  competitionId: bigint("competition_id", { mode: "number" }).notNull().references(() => competitions.id, { onDelete: "cascade" }),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupWorkouts = pgTable("group_workouts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  competitionId: bigint("competition_id", { mode: "number" }).notNull().references(() => competitions.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 160 }).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  description: varchar("description", { length: 500 }),
  isActive: boolean("is_active").notNull().default(true),
});

export const weeklyReports = pgTable("weekly_reports", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  competitionId: bigint("competition_id", { mode: "number" }).notNull().references(() => competitions.id, { onDelete: "cascade" }),
  reportDate: date("report_date", { mode: "string" }).notNull(),
  periodStart: date("period_start", { mode: "string" }),
  periodEnd: date("period_end", { mode: "string" }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  telegramMessageId: bigintString("telegram_message_id"),
  errorMessage: varchar("error_message", { length: 500 }),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
}, (table) => [uniqueIndex("weekly_reports_unique_idx").on(table.competitionId, table.reportDate)]);

export const botUpdates = pgTable("bot_updates", {
  updateId: bigintString("update_id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const draws = pgTable("draws", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  competitionId: bigint("competition_id", { mode: "number" }).notNull().references(() => competitions.id, { onDelete: "cascade" }),
  runId: varchar("run_id", { length: 64 }).notNull().unique(),
  winnersCount: integer("winners_count").notNull(),
  excludePreviousWinners: boolean("exclude_previous_winners").notNull().default(false),
  comment: varchar("comment", { length: 500 }),
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const drawParticipants = pgTable("draw_participants", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  drawId: bigint("draw_id", { mode: "number" }).notNull().references(() => draws.id, { onDelete: "cascade" }),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id),
  activeDays: integer("active_days").notNull(),
}, (table) => [uniqueIndex("draw_participants_unique_idx").on(table.drawId, table.userId)]);

export const drawWinners = pgTable("draw_winners", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  drawId: bigint("draw_id", { mode: "number" }).notNull().references(() => draws.id, { onDelete: "cascade" }),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id),
  position: integer("position").notNull(),
}, (table) => [
  uniqueIndex("draw_winners_user_idx").on(table.drawId, table.userId),
  uniqueIndex("draw_winners_position_idx").on(table.drawId, table.position),
]);

export const broadcastRuns = pgTable("broadcast_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  competitionId: bigint("competition_id", { mode: "number" }).notNull().references(() => competitions.id, { onDelete: "cascade" }),
  audience: varchar("audience", { length: 64 }).notNull(),
  minimumActiveDays: integer("minimum_active_days"),
  message: text("message").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  createdBy: bigint("created_by", { mode: "number" }).notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const broadcastResults = pgTable("broadcast_results", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  broadcastId: bigint("broadcast_id", { mode: "number" }).notNull().references(() => broadcastRuns.id, { onDelete: "cascade" }),
  userId: bigint("user_id", { mode: "number" }).notNull().references(() => users.id),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  telegramMessageId: bigintString("telegram_message_id"),
  errorMessage: varchar("error_message", { length: 500 }),
}, (table) => [uniqueIndex("broadcast_results_unique_idx").on(table.broadcastId, table.userId)]);
