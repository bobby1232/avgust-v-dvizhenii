import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { sendTelegramMessage } from "@/lib/telegram-bot";
import {
  adminGameCommands,
  handleGameCommand as handleBaseGameCommand,
  publicGameCommands,
} from "@/lib/bot-game-commands";

type BotUser = {
  id: number;
  telegramUsername: string | null;
  displayName: string;
  role: "participant" | "admin";
};

type Row = Record<string, unknown>;

export { adminGameCommands, publicGameCommands };

function rows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows?: Row[] }).rows ?? []);
  }
  return [];
}

function mention(row: Row): string {
  const username = String(row.telegram_username ?? "").trim().replace(/^@/, "");
  return username ? `@${username}` : String(row.display_name ?? "Участник");
}

const completeHelp = [
  "<b>🎮 Команды GOSUP GAMES</b>",
  "",
  "<b>Личное</b>",
  "/me — моя игровая карточка",
  "/progress — мой прогресс",
  "/notifications — включить или выключить напоминания",
  "",
  "<b>Рейтинги и игра</b>",
  "/rating_minutes — рейтинг по активным минутам",
  "/rating_days — рейтинг по активным дням",
  "/streak — лидеры текущих серий",
  "/achievements — лидеры по достижениям",
  "/top_week — лидеры за последние 7 дней",
  "/today — кто уже отметился сегодня",
  "/earlybirds — ранние тренировки до 08:00",
  "/nightowls — поздние тренировки после 21:00",
  "/activity_types — популярные активности",
  "/stats — общая статистика конкурса",
  "/legend — самая длинная тренировка",
  "/comeback — возвращения после перерыва",
  "/lottery — статус допуска к розыгрышу",
  "/random — случайный герой дня",
  "",
  "<b>Информация</b>",
  "/rules — правила",
  "/app — открыть приложение",
  "/help — список команд",
  "",
  "<b>Администратору</b>",
  "/waiting — кто сегодня ещё не отметился",
  "/admin_stats — административная статистика",
].join("\n");

async function sendComeback(chatId: string): Promise<void> {
  const competitionResult = await db.execute(sql`select id from competitions where is_active = true limit 1`);
  const competition = rows(competitionResult)[0];
  if (!competition) {
    await sendTelegramMessage(chatId, "Активный конкурс не найден.");
    return;
  }

  const result = await db.execute(sql`
    with ordered as (
      select a.user_id,
             a.activity_date,
             lag(a.activity_date) over (partition by a.user_id order by a.activity_date) as prev_date
      from (
        select distinct user_id, activity_date
        from activities
        where competition_id = ${Number(competition.id)} and status = 'approved'
      ) a
    ), comeback as (
      select user_id,
             activity_date,
             (activity_date - prev_date - 1)::int as gap
      from ordered
      where prev_date is not null and activity_date - prev_date - 1 >= 3
    )
    select u.telegram_username, u.display_name, c.activity_date, c.gap
    from comeback c
    join users u on u.id = c.user_id
    order by c.activity_date desc, c.gap desc
    limit 20
  `);

  const data = rows(result);
  if (!data.length) {
    await sendTelegramMessage(chatId, "Возвращений после длинного перерыва пока нет.");
    return;
  }

  await sendTelegramMessage(chatId, [
    "<b>🚀 Возвращения после перерыва</b>",
    "",
    ...data.map((row) => `🔥 ${mention(row)} — вернулся после ${Number(row.gap)} дн.`),
  ].join("\n"));
}

export async function handleGameCommand(
  command: string,
  chatId: string,
  user: BotUser | null,
): Promise<boolean> {
  if (command === "/help") {
    await sendTelegramMessage(chatId, completeHelp);
    return true;
  }
  if (command === "/comeback") {
    await sendComeback(chatId);
    return true;
  }
  return handleBaseGameCommand(command, chatId, user);
}
