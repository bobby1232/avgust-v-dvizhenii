import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { botUpdates, users } from "@/db/schema";
import { ApiError, jsonError } from "@/lib/api";
import { activeCompetition, userStats } from "@/lib/data";
import { appUrl, sendTelegramMessage } from "@/lib/telegram-bot";

const updateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: z.object({
    text: z.string().max(4096).optional(),
    chat: z.object({ id: z.union([z.number(), z.string()]) }),
    from: z.object({ id: z.union([z.number(), z.string()]) }).optional(),
  }).optional(),
});

const rules = [
  "<b>Правила GOSUP GAMES</b>",
  "Игра проходит с 1 по 31 августа по московскому времени.",
  "Отмечайте активности длительностью от 20 минут.",
  "Несколько тренировок можно сохранить отдельно, но день засчитывается один раз.",
  "20 активных дней дают участие в розыгрыше.",
].join("\n");

export async function POST(request: Request) {
  try {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
      throw new ApiError(401, "Неверный секрет webhook", "UNAUTHORIZED");
    }
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(400, "Некорректное обновление Telegram", "VALIDATION_ERROR");
    const [accepted] = await db.insert(botUpdates).values({
      updateId: String(parsed.data.update_id),
    }).onConflictDoNothing().returning();
    if (!accepted) return NextResponse.json({ ok: true, duplicate: true });
    const message = parsed.data.message;
    if (!message?.text || !message.from) return NextResponse.json({ ok: true });
    const chatId = String(message.chat.id);
    const telegramId = String(message.from.id);
    const command = message.text.trim().split(/\s+/)[0].split("@")[0].toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);

    if (command === "/start") {
      if (user) await db.update(users).set({ botStartedAt: new Date() }).where(eq(users.id, user.id));
      await sendTelegramMessage(chatId,
        [
          "Добро пожаловать в <b>GOSUP GAMES | 31 день в игре</b>!",
          "",
          "Приглашаем вас поучаствовать в нашем соревновании: двигайтесь каждый день, отмечайте активность и следите за своим прогрессом.",
          "",
          "Откройте мини-приложение по кнопке ниже, чтобы присоединиться.",
        ].join("\n"),
        { buttonText: "Участвовать в соревновании", buttonUrl: appUrl() });
    } else if (command === "/rules") {
      await sendTelegramMessage(chatId, rules);
    } else if (command === "/app") {
      await sendTelegramMessage(chatId, "Откройте GOSUP GAMES:", {
        buttonText: "Открыть приложение", buttonUrl: appUrl(),
      });
    } else if (!user) {
      await sendTelegramMessage(chatId, "Сначала зарегистрируйтесь в приложении.", {
        buttonText: "Открыть приложение", buttonUrl: appUrl(),
      });
    } else if (command === "/progress") {
      const competition = await activeCompetition();
      const stats = await userStats(user.id, competition.id);
      await sendTelegramMessage(chatId, [
        `<b>Ваш прогресс</b>`,
        `Активных дней: ${stats.activeDays}`,
        `Текущая серия: ${stats.currentStreak}`,
        `Максимальная серия: ${stats.maxStreak}`,
        `Пропущено дней: ${stats.missedDays}`,
        stats.remainingToDraw ? `До розыгрыша: ${stats.remainingToDraw}` : "Условие розыгрыша выполнено!",
      ].join("\n"));
    } else if (command === "/today") {
      const competition = await activeCompetition();
      const stats = await userStats(user.id, competition.id);
      await sendTelegramMessage(chatId,
        stats.checkedInToday ? "Сегодняшний день уже засчитан." : "Сегодня активность ещё не отмечена.",
        { buttonText: "Открыть форму", buttonUrl: appUrl() });
    } else if (command === "/achievements") {
      const competition = await activeCompetition();
      const stats = await userStats(user.id, competition.id);
      const text = stats.achievements.length
        ? stats.achievements.map((item) => `${item.emoji} ${item.name}`).join("\n")
        : "Достижений пока нет. Продолжайте движение!";
      await sendTelegramMessage(chatId, `<b>Ваши достижения</b>\n${text}`);
    } else if (command === "/notifications") {
      const enabled = !user.notificationsEnabled;
      await db.update(users).set({ notificationsEnabled: enabled }).where(eq(users.id, user.id));
      await sendTelegramMessage(chatId, enabled ? "Вечерние напоминания включены." : "Вечерние напоминания выключены.");
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, "bot.webhook");
  }
}
