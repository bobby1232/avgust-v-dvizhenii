import { groupFeedEvents } from "@/db/schema";

type Inserter = { insert: (table: typeof groupFeedEvents) => any };

export function activityFeedPayload(activity: {
  id: number; userId: number; activityDate: string; activityType: string;
  customActivityName: string | null; durationMinutes: number; description: string | null;
  evidencePhotos: string[];
  createdAt: Date;
}, user: { displayName: string; department: string | null; telegramUsername: string | null }) {
  return {
    activityId: activity.id, userId: activity.userId, displayName: user.displayName,
    telegramUsername: user.telegramUsername, department: user.department, activityDate: activity.activityDate,
    activityType: activity.activityType, customActivityName: activity.customActivityName,
    durationMinutes: activity.durationMinutes, description: activity.description,
    evidencePhotos: activity.evidencePhotos,
    createdAt: activity.createdAt.toISOString(),
  };
}

export async function enqueueActivityEvent(tx: Inserter, competitionId: number,
  activity: Parameters<typeof activityFeedPayload>[0], user: Parameters<typeof activityFeedPayload>[1]) {
  return tx.insert(groupFeedEvents).values({
    competitionId, eventType: "activity", entityType: "activity", entityId: String(activity.id),
    dedupeKey: `activity:${activity.id}:approved`, payload: activityFeedPayload(activity, user),
  }).onConflictDoNothing().returning();
}

export async function enqueueAchievementEvent(tx: Inserter, input: {
  id: number; competitionId: number; userId: number; achievementId: number; source: string;
  eventVersion?: string;
}) {
  const eventVersion = input.eventVersion ?? "initial";
  return tx.insert(groupFeedEvents).values({
    competitionId: input.competitionId, eventType: "achievement", entityType: "user_achievement",
    entityId: String(input.id), dedupeKey: `achievement:${input.id}:awarded:${eventVersion}`,
    payload: input,
  }).onConflictDoNothing().returning();
}
