import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { activities, auditLogs } from "@/db/schema";
import { requireSession, jsonError, ApiError } from "@/lib/api";
import { activeCompetition, registeredUser } from "@/lib/data";
import { activitySchema } from "@/lib/validation";

export async function GET() {
  try {
    const session = await requireSession();
    const [user, competition] = await Promise.all([
      registeredUser(session.id),
      activeCompetition(),
    ]);

    return NextResponse.json({
      activities: await db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.userId, user.id),
            eq(activities.competitionId, competition.id),
          ),
        )
        .orderBy(desc(activities.activityDate)),
    });
  } catch (error) {
    return jsonError(error, "activities.get");
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const parsed = activitySchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(400, "Некорректная активность", "VALIDATION_ERROR");
    }

    const today = new Date().toISOString().slice(0, 10);
    const date = parsed.data.activityDate ?? today;

    if (date !== today) {
      throw new ApiError(
        400,
        "Активность можно добавить только за текущий день",
        "ACTIVITY_DATE_NOT_TODAY",
      );
    }

    const [user, competition] = await Promise.all([
      registeredUser(session.id),
      activeCompetition(),
    ]);

    const [activity] = await db
      .insert(activities)
      .values({
        userId: user.id,
        competitionId: competition.id,
        activityDate: today,
        activityType: parsed.data.activityType,
        description: parsed.data.description || null,
      })
      .returning();

    await db.insert(auditLogs).values({
      actorTelegramId: session.id,
      action: "activity.created",
      entityType: "activity",
      entityId: String(activity.id),
    });

    return NextResponse.json({ activity }, { status: 201 });
  } catch (error) {
    return jsonError(error, "activities.post");
  }
}
