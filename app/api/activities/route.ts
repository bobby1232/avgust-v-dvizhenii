import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { activities, activityTypes } from "@/db/schema";
import { requireSession, jsonError, ApiError } from "@/lib/api";
import { activeCompetition, registeredUser } from "@/lib/data";
import { activitySchema } from "@/lib/validation";
import { createParticipantActivity } from "@/lib/activity-service";

export async function GET() {
  try {
    const session = await requireSession();
    const [user, competition] = await Promise.all([
      registeredUser(session.id),
      activeCompetition(),
    ]);

    const [items, types] = await Promise.all([
      db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.userId, user.id),
            eq(activities.competitionId, competition.id),
          ),
        )
        .orderBy(desc(activities.activityDate), desc(activities.createdAt)),
      db.select({ name: activityTypes.name }).from(activityTypes)
        .where(eq(activityTypes.isActive, true)).orderBy(activityTypes.sortOrder),
    ]);
    return NextResponse.json({ activities: items, activityTypes: types.map((item) => item.name) });
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

    if (parsed.data.activityDate) {
      throw new ApiError(
        400,
        "Дату активности определяет сервер по московскому времени",
        "ACTIVITY_DATE_NOT_TODAY",
      );
    }

    const [user, competition] = await Promise.all([
      registeredUser(session.id),
      activeCompetition(),
    ]);

    const result = await createParticipantActivity(user, competition, parsed.data, session.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error, "activities.post");
  }
}
