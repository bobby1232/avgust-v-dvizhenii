import { NextResponse } from "next/server";
import { ApiError, jsonError } from "@/lib/api";
import { processGroupFeed } from "@/lib/group-feed-service";

export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      throw new ApiError(401, "Неверный секрет cron", "UNAUTHORIZED");
    }
    return NextResponse.json(await processGroupFeed());
  } catch (error) { return jsonError(error, "cron.group-feed"); }
}
