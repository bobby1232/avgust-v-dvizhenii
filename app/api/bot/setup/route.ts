import { NextResponse } from "next/server";
import { appUrl, telegramRequest } from "@/lib/telegram-bot";

export async function GET() {
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secretToken) {
    return NextResponse.json(
      { ok: false, error: "TELEGRAM_WEBHOOK_SECRET is not configured" },
      { status: 503 },
    );
  }

  const webhookUrl = `${appUrl()}/api/bot/webhook`;

  const result = await telegramRequest<boolean>("setWebhook", {
    url: webhookUrl,
    secret_token: secretToken,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });

  return NextResponse.json({
    ok: result,
    webhookUrl,
    pendingUpdatesPreserved: true,
  });
}
