import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { sendTelegramMessage } from "@/lib/telegram-bot";
import { userStats } from "@/lib/data";

type BotUser = {
  id: number;
  telegramUsername: string | null;
  displayName: string;
  role: "participant" | "admin";
};

type Row = Record<string, unknown>;

export const publicGameCommands = new Set([
  "/help", "/rating_minutes", "/rating_days", "/streak", "/achievements",
  "/earlybirds", "/nightowls", "/today", "/stats", "/activity_types",
  "/random", "/legend", "/top_week", "/comeback", "/lottery", "/me",
]);

export const adminGameCommands = new Set(["/waiting", "/admin_stats"]);

const helpText = [
  "<b>🎮 Команды GOSUP GAMES</b>",
  "",
  "/me — моя игровая карточка",
  "/today — кто уже отметился сегодня",
  "/rating_minutes — рейтинг по минутам",
  "/rating_days — рейтинг по активным дням",
  "/streak — лидеры текущих серий",
  "/achievements — лидеры по достижениям",
  "/top_week — лидеры за последние 7 дней",
  "/earlybirds — ранние тренировки до 08:00",
  "/nightowls — поздние тренировки после 21:00",
  "/activity_types — популярные активности",
  "/stats — общая статистика конкурса",
  "/legend — самая длинная тренировка",
  "/comeback — возвращения после перерыва",
  "/lottery — статус допуска к розыгрышу",
  "/random — случайный герой дня",
  "",
  "Администратору: /waiting, /admin_stats",
].join("\n");

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

function medal(index: number): string {
  return ["🥇", "🥈", "🥉"][index] ?? `${index + 1}.`;
}

function movementArrow(currentPosition: number, previousPosition: number | null): string {
  if (!previousPosition) return "←";
  if (currentPosition < previousPosition) return "↑";
  if (currentPosition > previousPosition) return "↓";
  return "→";
}

function limited(title: string, lines: string[], footer = ""): string {
  let text = `<b>${title}</b>\n\n`;
  for (let index = 0; index < lines.length; index += 1) {
    const next = `${text}${lines[index]}\n`;
    if (`${next}${footer}`.length > 3900) {
      text += `…и ещё ${lines.length - index} участник(ов)\n`;
      break;
    }
    text = next;
  }
  return `${text.trimEnd()}${footer}`;
}

async function competitionId(): Promise<number | null> {
  const result = await db.execute(sql`select id from competitions where is_active = true limit 1`);
  const row = rows(result)[0];
  return row ? Number(row.id) : null;
}

async function requireCompetition(chatId: string): Promise<number | null> {
  const id = await competitionId();
  if (!id) await sendTelegramMessage(chatId, "Активный конкурс не найден.");
  return id;
}

async function sendRating(chatId: string, mode: "minutes" | "days"): Promise<void> {
  const competition = await requireCompetition(chatId); if (!competition) return;
  const metric = mode === "minutes" ? sql`sum(a.duration_minutes)` : sql`count(distinct a.activity_date)`;
  const [currentResult, previousResult] = await Promise.all([
    db.execute(sql`
      select u.id as user_id, u.telegram_username, u.display_name,
             ${metric}::int as value,
             count(a.id)::int as activities_count
      from activities a join users u on u.id = a.user_id
      where a.competition_id = ${competition} and a.status = 'approved' and u.is_active = true
      group by u.id, u.telegram_username, u.display_name
      order by value desc, activities_count desc, u.display_name
    `),
    db.execute(sql`
      select u.id as user_id,
             ${metric}::int as value,
             count(a.id)::int as activities_count
      from activities a join users u on u.id = a.user_id
      where a.competition_id = ${competition} and a.status = 'approved' and u.is_active = true
        and a.activity_date < (now() at time zone 'Europe/Moscow')::date
      group by u.id, u.display_name
      order by value desc, activities_count desc, u.display_name
    `),
  ]);
  const data = rows(currentResult);
  if (!data.length) { await sendTelegramMessage(chatId, "Пока нет одобренных активностей."); return; }
  const previousPositions = new Map(rows(previousResult).map((row, index) => [Number(row.user_id), index + 1]));
  const unit = mode === "minutes" ? "мин." : "дн.";
  await sendTelegramMessage(chatId, limited(mode === "minutes" ? "🏆 Рейтинг по активным минутам" : "📅 Рейтинг по активным дням",
    data.map((row, i) => `${medal(i)} ${movementArrow(i + 1, previousPositions.get(Number(row.user_id)) ?? null)} ${mention(row)} — ${Number(row.value)} ${unit}`),
    "\n\n↑ поднялся · ↓ опустился · → без изменений · ← новый в рейтинге"));
}

async function sendStreaks(chatId: string): Promise<void> {
  const competition = await requireCompetition(chatId); if (!competition) return;
  const result = await db.execute(sql`
    select u.telegram_username, u.display_name, ad.activity_date
    from activity_days ad join users u on u.id = ad.user_id
    where ad.competition_id = ${competition} and u.is_active = true
    order by u.id, ad.activity_date desc
  `);
  const grouped = new Map<string, { row: Row; dates: string[] }>();
  for (const row of rows(result)) {
    const key = `${row.telegram_username ?? ""}|${row.display_name}`;
    const item = grouped.get(key) ?? { row, dates: [] };
    item.dates.push(String(row.activity_date)); grouped.set(key, item);
  }
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  today.setHours(0, 0, 0, 0);
  const ranking = [...grouped.values()].map((item) => {
    const set = new Set(item.dates);
    let cursor = new Date(today);
    if (!set.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (set.has(cursor.toISOString().slice(0, 10))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
    return { row: item.row, streak };
  }).filter((x) => x.streak > 0).sort((a, b) => b.streak - a.streak);
  await sendTelegramMessage(chatId, ranking.length ? limited("🔥 Текущие серии", ranking.map((x, i) => `${medal(i)} ${mention(x.row)} — ${x.streak} дн.`)) : "Активных серий пока нет.");
}

async function sendAchievements(chatId: string): Promise<void> {
  const competition = await requireCompetition(chatId); if (!competition) return;
  const result = await db.execute(sql`
    select u.telegram_username, u.display_name, count(ua.id)::int as value
    from user_achievements ua join users u on u.id = ua.user_id
    where ua.competition_id = ${competition} and ua.revoked_at is null and u.is_active = true
    group by u.id, u.telegram_username, u.display_name order by value desc, u.display_name
  `);
  const data = rows(result);
  await sendTelegramMessage(chatId, data.length ? limited("🏅 Лидеры по достижениям", data.map((r, i) => `${medal(i)} ${mention(r)} — ${Number(r.value)}`)) : "Достижений пока нет.");
}

async function sendTimeLeaders(chatId: string, early: boolean): Promise<void> {
  const competition = await requireCompetition(chatId); if (!competition) return;
  const result = await db.execute(sql`
    select u.telegram_username, u.display_name, count(a.id)::int as value
    from activities a join users u on u.id = a.user_id
    where a.competition_id = ${competition} and a.status = 'approved'
      and ${early ? sql`(a.created_at at time zone 'Europe/Moscow')::time < time '08:00'` : sql`(a.created_at at time zone 'Europe/Moscow')::time >= time '21:00'`}
    group by u.id, u.telegram_username, u.display_name order by value desc, u.display_name limit 20
  `);
  const data = rows(result);
  await sendTelegramMessage(chatId, data.length ? limited(early ? "🌅 Жаворонки" : "🌙 Ночные совы", data.map((r, i) => `${medal(i)} ${mention(r)} — ${Number(r.value)} акт.`)) : "Подходящих активностей пока нет.");
}

async function sendToday(chatId: string, waiting: boolean): Promise<void> {
  const competition = await requireCompetition(chatId); if (!competition) return;
  const result = await db.execute(waiting ? sql`
    select u.telegram_username, u.display_name from users u
    where u.is_active = true and not exists (
      select 1 from activities a where a.user_id = u.id and a.competition_id = ${competition}
      and a.status = 'approved' and a.activity_date = (now() at time zone 'Europe/Moscow')::date)
    order by u.display_name
  ` : sql`
    select distinct u.telegram_username, u.display_name from activities a join users u on u.id = a.user_id
    where a.competition_id = ${competition} and a.status = 'approved'
      and a.activity_date = (now() at time zone 'Europe/Moscow')::date order by u.display_name
  `);
  const data = rows(result);
  await sendTelegramMessage(chatId, limited(waiting ? "⏳ Сегодня ещё не отметились" : "✅ Сегодня уже в игре", data.map((r) => `${waiting ? "⚪" : "✅"} ${mention(r)}`), `\n\nВсего: ${data.length}`));
}

async function sendStats(chatId: string): Promise<void> {
  const competition = await requireCompetition(chatId); if (!competition) return;
  const result = await db.execute(sql`
    select count(distinct u.id)::int participants, count(a.id)::int activities,
      coalesce(sum(a.duration_minutes),0)::int minutes,
      coalesce(round(avg(a.duration_minutes)),0)::int avg_minutes,
      count(distinct case when a.activity_date = (now() at time zone 'Europe/Moscow')::date then a.user_id end)::int today
    from users u left join activities a on a.user_id = u.id and a.competition_id = ${competition} and a.status = 'approved'
    where u.is_active = true
  `);
  const r = rows(result)[0] ?? {};
  await sendTelegramMessage(chatId, ["<b>📈 Статистика GOSUP GAMES</b>", "", `Участников: ${r.participants ?? 0}`, `Активностей: ${r.activities ?? 0}`, `Активных минут: ${r.minutes ?? 0}`, `Средняя тренировка: ${r.avg_minutes ?? 0} мин.`, `Сегодня отметились: ${r.today ?? 0}`].join("\n"));
}

async function sendActivityTypes(chatId: string): Promise<void> {
  const competition = await requireCompetition(chatId); if (!competition) return;
  const result = await db.execute(sql`
    select coalesce(nullif(custom_activity_name,''), activity_type) as name, count(*)::int value
    from activities where competition_id = ${competition} and status = 'approved'
    group by 1 order by value desc, name limit 20
  `);
  await sendTelegramMessage(chatId, limited("🏃 Популярные активности", rows(result).map((r, i) => `${i + 1}. ${r.name} — ${r.value}`)));
}

async function sendRandom(chatId: string): Promise<void> {
  const competition = await requireCompetition(chatId); if (!competition) return;
  const result = await db.execute(sql`
    select u.telegram_username, u.display_name from users u
    where u.is_active = true and exists (select 1 from activities a where a.user_id=u.id and a.competition_id=${competition} and a.status='approved')
    order by random() limit 1
  `);
  const r = rows(result)[0];
  await sendTelegramMessage(chatId, r ? `<b>🎲 Герой дня</b>\n\n${mention(r)}\n\nСегодня удача выбрала тебя 🔥` : "Пока некого выбирать.");
}

async function sendLegend(chatId: string): Promise<void> {
  const competition = await requireCompetition(chatId); if (!competition) return;
  const result = await db.execute(sql`
    select u.telegram_username, u.display_name, a.duration_minutes, coalesce(nullif(a.custom_activity_name,''),a.activity_type) name, a.activity_date
    from activities a join users u on u.id=a.user_id
    where a.competition_id=${competition} and a.status='approved'
    order by a.duration_minutes desc, a.created_at asc limit 1
  `);
  const r = rows(result)[0];
  await sendTelegramMessage(chatId, r ? `<b>👑 Легенда конкурса</b>\n\n${mention(r)}\n${r.name} — ${r.duration_minutes} мин.\nДата: ${r.activity_date}` : "Активностей пока нет.");
}

async function sendTopWeek(chatId: string): Promise<void> {
  const competition = await requireCompetition(chatId); if (!competition) return;
  const result = await db.execute(sql`
    select u.telegram_username,u.display_name,sum(a.duration_minutes)::int value
    from activities a join users u on u.id=a.user_id
    where a.competition_id=${competition} and a.status='approved' and a.activity_date >= (now() at time zone 'Europe/Moscow')::date - 6
    group by u.id,u.telegram_username,u.display_name order by value desc,u.display_name limit 20
  `);
  await sendTelegramMessage(chatId, limited("⚡ Топ за последние 7 дней", rows(result).map((r,i)=>`${medal(i)} ${mention(r)} — ${r.value} мин.`)));
}

async function sendComeback(chatId: string): Promise<void> {
  const competition = await requireCompetition(chatId); if (!competition) return;
  const result = await db.execute(sql`
    with ordered as (
      select a.user_id,a.activity_date,lag(a.activity_date) over(partition by a.user_id order by a.activity_date) prev_date
      from (select distinct user_id,activity_date from activities where competition_id=${competition} and status='approved') a
    )
    select u.telegram_username,u.display_name,o.activity_date,(o.activity_date-o.prev_date-1)::int gap
    from ordered o join users u on u.id=o.user_id where o.prev_date is not null and o.activity_date-o.prev_date-1 >= 3
    order by o.activity_date desc,o.gap desc limit 20
  `);
  const data=rows(result);
  await sendTelegramMessage(chatId,data.length?limited("🚀 Возвращения после перерыва",data.map(r=>`🔥 ${mention(r)} — вернулся после ${r.gap} дн.`)):"Возвращений после длинного перерыва пока нет.");
}

async function sendLottery(chatId: string): Promise<void> {
  const competition=await requireCompetition(chatId); if(!competition)return;
  const result=await db.execute(sql`
    select u.telegram_username,u.display_name,count(distinct ad.activity_date)::int days
    from users u left join activity_days ad on ad.user_id=u.id and ad.competition_id=${competition}
    where u.is_active=true group by u.id,u.telegram_username,u.display_name order by days desc,u.display_name
  `);
  const data=rows(result); const qualified=data.filter(r=>Number(r.days)>=20).length;
  const near=data.filter(r=>Number(r.days)<20).slice(0,15);
  await sendTelegramMessage(chatId,limited("🎁 Допуск к розыгрышу",[`Уже допущены: ${qualified}`,"",...near.map(r=>`${mention(r)} — осталось ${20-Number(r.days)} дн.`)]));
}

async function sendMe(chatId:string,user:BotUser):Promise<void>{
  const competition=await requireCompetition(chatId);if(!competition)return;
  const stats=await userStats(user.id,competition);
  const result=await db.execute(sql`select coalesce(sum(duration_minutes),0)::int minutes,count(*)::int activities from activities where competition_id=${competition} and user_id=${user.id} and status='approved'`);
  const r=rows(result)[0]??{};
  await sendTelegramMessage(chatId,[`<b>🏃 ${user.displayName}</b>`,"",`Активных дней: ${stats.activeDays}`,`Активностей: ${r.activities??0}`,`Минут: ${r.minutes??0}`,`Текущая серия: ${stats.currentStreak}`,`Максимальная серия: ${stats.maxStreak}`,`Достижений: ${stats.achievements.length}`,stats.remainingToDraw?`До розыгрыша: ${stats.remainingToDraw} дн.`:"Условие розыгрыша выполнено!"].join("\n"));
}

async function sendAdminStats(chatId:string):Promise<void>{
  const competition=await requireCompetition(chatId);if(!competition)return;
  const result=await db.execute(sql`
    select count(distinct u.id)::int users,
      count(distinct case when a.activity_date=(now() at time zone 'Europe/Moscow')::date and a.status='approved' then a.user_id end)::int today,
      count(case when a.status='pending' then 1 end)::int pending,
      count(case when a.status='rejected' then 1 end)::int rejected
    from users u left join activities a on a.user_id=u.id and a.competition_id=${competition} where u.is_active=true
  `);const r=rows(result)[0]??{};
  await sendTelegramMessage(chatId,["<b>🛠 Административная статистика</b>","",`Участников: ${r.users??0}`,`Сегодня отметились: ${r.today??0}`,`Ожидают модерации: ${r.pending??0}`,`Отклонено: ${r.rejected??0}`].join("\n"));
}

export async function handleGameCommand(command:string,chatId:string,user:BotUser|null):Promise<boolean>{
  if(command==="/help"){await sendTelegramMessage(chatId,helpText);return true;}
  if(adminGameCommands.has(command)){if(!user||user.role!=="admin"){await sendTelegramMessage(chatId,"Команда доступна только администратору.");return true;} if(command==="/waiting")await sendToday(chatId,true);else await sendAdminStats(chatId);return true;}
  if(!publicGameCommands.has(command))return false;
  if(command==="/me"&&!user){await sendTelegramMessage(chatId,"Сначала зарегистрируйтесь в приложении.");return true;}
  switch(command){
    case "/rating_minutes":await sendRating(chatId,"minutes");break;
    case "/rating_days":await sendRating(chatId,"days");break;
    case "/streak":await sendStreaks(chatId);break;
    case "/achievements":await sendAchievements(chatId);break;
    case "/earlybirds":await sendTimeLeaders(chatId,true);break;
    case "/nightowls":await sendTimeLeaders(chatId,false);break;
    case "/today":await sendToday(chatId,false);break;
    case "/stats":await sendStats(chatId);break;
    case "/activity_types":await sendActivityTypes(chatId);break;
    case "/random":await sendRandom(chatId);break;
    case "/legend":await sendLegend(chatId);break;
    case "/top_week":await sendTopWeek(chatId);break;
    case "/comeback":await sendComeback(chatId);break;
    case "/lottery":await sendLottery(chatId);break;
    case "/me":await sendMe(chatId,user as BotUser);break;
  }
  return true;
}
