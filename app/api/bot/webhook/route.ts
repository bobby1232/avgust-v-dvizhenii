import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { activities, botUpdates, competitions, users } from "@/db/schema";
import { ApiError, jsonError } from "@/lib/api";
import { welcomeBannerDataUrl } from "@/lib/assets/welcome-banner";
import { activeCompetition, userStats } from "@/lib/data";
import { appUrl, sendTelegramMessage, sendTelegramPhotoPost, setTelegramHeartReaction } from "@/lib/telegram-bot";

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

const ratingCommands = new Set([
  "/rating",
  "/leaderboard",
  "/rating_minutes",
  "/рейтинг",
  "/рейтинг_минут",
]);

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
].join("\n");

const rules = [
  "<b>Правила конкурса</b>",
  "",
  "1. Игровой день — с 00:00 до 23:59 по московскому времени.",
  "2. Засчитывается любая осознанная физическая активность длительностью от 20 минут.",
  "3. К активности приложите 1–2 фото: фото из приложения или с часов. Если такой возможности нет — сфотографируйте себя рядом с местом или инвентарём для спортивной активности.",
  "4. Можно добавить несколько тренировок, но календарный день и серия увеличиваются только один раз.",
  "5. Пропуск обнуляет текущую серию, но не удаляет уже набранные активные дни.",
  "6. Минимум 20 активных дней даёт допуск к итоговому розыгрышу.",
  "",
  "<b>Не важно, что ты делаешь. Важно — не останавливаться.</b>",
  "",
  "Нажмите кнопку ниже, чтобы открыть мини-приложение, зарегистрироваться и отметить активность.",
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

async function sendMinutesRating(chatId: string): Promise<void> {
  const [competition] = await db.select({ id: competitions.id })
    .from(competitions)
    .where(eq(competitions.isActive, true))
    .limit(1);

  if (!competition) {
    await sendTelegramMessage(chatId, "Активный конкурс не найден.");
    return;
  }

  const totalMinutes = sql<number>`sum(${activities.durationMinutes})`;
  const activitiesCount = sql<number>`count(${activities.id})`;

  const rating = await db.select({
    telegramUsername: users.telegramUsername,
    displayName: users.displayName,
    totalMinutes,
    activitiesCount,
  })
    .from(activities)
    .innerJoin(users, eq(users.id, activities.userId))
    .where(and(
      eq(activities.competitionId, competition.id),
      eq(activities.status, "approved"),
      eq(users.isActive, true),
    ))
    .groupBy(users.id, users.telegramUsername, users.displayName)
    .orderBy(desc(totalMinutes), desc(activitiesCount), users.displayName);

  if (!rating.length) {
    await sendTelegramMessage(chatId, "Пока нет одобренных активностей для рейтинга.");
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines = rating.map((item, index) => {
    const place = medals[index] ?? `${index + 1}.`;
    const username = item.telegramUsername?.trim();
    const participant = username ? `@${username.replace(/^@/, "")}` : item.displayName;
    return `${place} ${participant} — ${Number(item.totalMinutes)} мин. · ${Number(item.activitiesCount)} акт.`;
  });

  const header = "<b>🏆 Рейтинг по активным минутам</b>\n\n";
  const footer = "\n\n🔥 Продолжаем двигаться каждый день!";
  let body = "";
  let hiddenCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const candidate = body ? `${body}\n${lines[index]}` : lines[index];
    if ((header + candidate + footer).length > 3900) {
      hiddenCount = lines.length - index;
      break;
    }
    body = candidate;
  }

  const truncated = hiddenCount > 0 ? `${body}\n…и ещё ${hiddenCount} участник(ов)` : body;
  await sendTelegramMessage(chatId, header + truncated + footer);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "telegram-webhook",
    ratingCommands: [...ratingCommands],
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
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
    const [accepted] = await db.insert(botUpdates).values({
      updateId: acceptedUpdateId,
    }).onConflictDoNothing().returning();
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

    const chatId = String(message.chat.id);
    const telegramId = String(message.from.id);
    const command = message.text.trim().split(/\s+/)[0].split("@")[0].toLowerCase();

    if (ratingCommands.has(command)) {
      await sendMinutesRating(chatId);
      return NextResponse.json({ ok: true });
    }

    const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);

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
      await sendTelegramMessage(chatId, "Сначала зарегистрируйтесь в приложении.", {
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
