import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { botUpdates, users } from "@/db/schema";
import { ApiError, jsonError } from "@/lib/api";
import { welcomeBannerDataUrl } from "@/lib/assets/welcome-banner";
import { activeCompetition, userStats } from "@/lib/data";
import { adminGameCommands, handleGameCommand, publicGameCommands } from "@/lib/bot-game-command-router";
import { appUrl, sendTelegramMessage, sendTelegramPhotoPost, setTelegramHeartReaction, telegramRequest } from "@/lib/telegram-bot";

const updateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: z.object({
    message_id: z.number().int().positive(),
    message_thread_id: z.number().int().positive().optional(),
    text: z.string().max(4096).optional(),
    chat: z.object({ id: z.union([z.number(), z.string()]) }),
    from: z.object({ id: z.union([z.number(), z.string()]) }).optional(),
  }).optional(),
});

const competitionInfo = [
  "<b>АВГУСТ В ДВИЖЕНИИ</b>",
  "",
  "🏃 Выполняйте любую осознанную физическую активность от 20 минут.",
  "📸 Подтверждайте её фотографией.",
  "🏆 Открывайте достижения.",
  "🎁 Наберите минимум 20 активных дней и участвуйте в розыгрыше призов.",
  "",
  "Игра проходит с 1 по 31 августа по московскому времени.",
].join("\n");

const welcomeMessage = [
  "👋 <b>Добро пожаловать в GOSUP GAMES!</b>",
  "",
  "В августе мы двигаемся каждый день — без гонки за скоростью, километрами и местами.",
  "Главная цель — сформировать устойчивую привычку не останавливаться.",
  "",
  "Все игровые команды: /help",
].join("\n");

const rules = [
  "<b>Правила конкурса</b>",
  "",
  "1. Игровой день — с 00:00 до 23:59 по московскому времени.",
  "2. Засчитывается любая осознанная физическая активность длительностью от 20 минут.",
  "3. К активности приложите 1–2 фото: фото из приложения или с часов. Если такой возможности нет — сфотографируйте себя рядом с местом или инвентарём.",
  "4. Можно добавить несколько тренировок, но календарный день и серия увеличиваются только один раз.",
  "5. Пропуск обнуляет текущую серию, но не удаляет уже набранные активные дни.",
  "6. Минимум 20 активных дней даёт допуск к итоговому розыгрышу.",
  "",
  "<b>Не важно, что ты делаешь. Важно — не останавливаться.</b>",
].join("\n");

async function sendStartSequence(chatId: string): Promise<void> {
  try {
    await sendTelegramPhotoPost(chatId, [welcomeBannerDataUrl], competitionInfo);
  } catch (error) {
    console.error("[bot.start.banner]", error);
    await sendTelegramMessage(chatId, competitionInfo);
  }
  await sendTelegramMessage(chatId, welcomeMessage);
  await sendTelegramMessage(chatId, rules, {
    buttonText: "Запустить мини-приложение",
    buttonUrl: appUrl(),
  });
}

type WebhookInfo = {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
};

export async function GET() {
  let telegramWebhook: WebhookInfo | { error: string } | null = null;
  try {
    telegramWebhook = await telegramRequest<WebhookInfo>("getWebhookInfo", {});
  } catch (error) {
    telegramWebhook = { error: error instanceof Error ? error.message : "Unknown Telegram error" };
  }

  return NextResponse.json({
    ok: true,
    service: "telegram-webhook",
    commands: [...publicGameCommands, ...adminGameCommands],
    ratingCommand: "/rating_minutes",
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    telegramWebhook,
  }, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  let acceptedUpdateId: string | null = null;

  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
      throw new ApiError(401, "Неверный секрет webhook", "UNAUTHORIZED");
    }

    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, "Некорректное обновление Telegram", "VALIDATION_ERROR");

    acceptedUpdateId = String(parsed.data.update_id);
    const [accepted] = await db.insert(botUpdates).values({ updateId: acceptedUpdateId })
      .onConflictDoNothing().returning();
    if (!accepted) return NextResponse.json({ ok: true, duplicate: true });

    const message = parsed.data.message;
    if (message?.message_thread_id === Number(process.env.TELEGRAM_REPORT_THREAD_ID)) {
      try {
        await setTelegramHeartReaction(String(message.chat.id), message.message_id);
      } catch (error) {
        console.error("[bot.thread-reaction]", error);
      }
    }

    if (!message?.text || !message.from) return NextResponse.json({ ok: true });

    const messageText = message.text.trim();
    if (!messageText.startsWith("/")) return NextResponse.json({ ok: true, ignored: "non-command" });

    const chatId = String(message.chat.id);
    const telegramId = String(message.from.id);
    const command = messageText.split(/\s+/)[0].split("@")[0].toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);

    if (await handleGameCommand(command, chatId, user ?? null)) {
      return NextResponse.json({ ok: true });
    }

    if (command === "/start") {
      if (user) await db.update(users).set({ botStartedAt: new Date() }).where(eq(users.id, user.id));
      await sendStartSequence(chatId);
    } else if (command === "/rules") {
      await sendTelegramMessage(chatId, rules, {
        buttonText: "Запустить мини-приложение",
        buttonUrl: appUrl(),
      });
    } else if (command === "/app") {
      await sendTelegramMessage(chatId, "Откройте GOSUP GAMES:", {
        buttonText: "Открыть приложение", buttonUrl: appUrl(),
      });
    } else if (!user) {
      await sendTelegramMessage(chatId, "Сначала зарегистрируйтесь в приложении. Доступные команды: /help", {
        buttonText: "Открыть приложение", buttonUrl: appUrl(),
      });
    } else if (command === "/progress") {
      const competition = await activeCompetition();
      const stats = await userStats(user.id, competition.id);
      await sendTelegramMessage(chatId, [
        "<b>Ваш прогресс</b>",
        `Активных дней: ${stats.activeDays}`,
        `Текущая серия: ${stats.currentStreak}`,
        `Максимальная серия: ${stats.maxStreak}`,
        `Пропущено дней: ${stats.missedDays}`,
        stats.remainingToDraw ? `До розыгрыша: ${stats.remainingToDraw}` : "Условие розыгрыша выполнено!",
      ].join("\n"));
    } else if (command === "/notifications") {
      const enabled = !user.notificationsEnabled;
      await db.update(users).set({ notificationsEnabled: enabled }).where(eq(users.id, user.id));
      await sendTelegramMessage(chatId, enabled ? "Вечерние напоминания включены." : "Вечерние напоминания выключены.");
    } else {
      await sendTelegramMessage(chatId, "Неизвестная команда. Откройте список: /help");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (acceptedUpdateId) {
      try {
        await db.delete(botUpdates).where(eq(botUpdates.updateId, acceptedUpdateId));
      } catch (cleanupError) {
        console.error("[bot.webhook.cleanup]", cleanupError);
      }
    }
    return jsonError(error, "bot.webhook");
  }
}
