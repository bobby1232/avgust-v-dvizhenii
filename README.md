# GOSUP GAMES | 31 день в игре

Telegram Mini App и бот для игры ежедневной физической активности с 1 по 31 августа 2026 года. Игровая дата определяется сервером в `Europe/Moscow`. Несколько тренировок сохраняются отдельно, но один календарный день даёт максимум один активный день и один шаг серии.

Слоган: **Не важно, что ты делаешь. Важно — не останавливаться.**

## Стек и архитектура

- Next.js 16, React 19, TypeScript, Node.js 22.
- PostgreSQL и Drizzle ORM с версионированными SQL-миграциями.
- Telegram Mini App HMAC-аутентификация и подписанная `httpOnly`-сессия.
- Telegram Bot API для команд, напоминаний, отчётов и рассылок.
- Railway Docker deployment; миграции запускаются в `preDeployCommand`.

Основные каталоги: `app/api` — HTTP API, `lib` — бизнес-сервисы, `db/schema.ts` — Drizzle schema, `drizzle` — миграции, `tests` — unit/static/integration tests.

## Переменные окружения

Скопируйте `.env.example` в `.env.local`. Реальные секреты не коммитьте.

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram-бота |
| `TELEGRAM_WEBHOOK_SECRET` | Секрет заголовка Telegram webhook |
| `ADMIN_TELEGRAM_IDS` | Числовые Telegram ID администраторов через запятую |
| `SESSION_SECRET` | Случайная строка не короче 32 символов |
| `APP_URL` | Публичный HTTPS URL Mini App |
| `CRON_SECRET` | Bearer-секрет cron endpoints |
| `TELEGRAM_REPORT_CHAT_ID` | Fallback chat ID недельного отчёта и групповой ленты |
| `LEADERBOARD_DAY_TIME_MSK` | Время дневного лидерборда по Москве, `HH:MM` (по умолчанию `12:00`) |
| `LEADERBOARD_EVENING_TIME_MSK` | Время вечернего лидерборда по Москве, `HH:MM` (по умолчанию `20:30`) |
| `DAILY_SUMMARY_TIME_MSK` | Время итогов дня по Москве, `HH:MM` (по умолчанию `21:30`) |
| `DEV_TELEGRAM_USER_ID` | Локальный пользователь; игнорируется в production |
| `DATABASE_POOL_SIZE` | Размер пула PostgreSQL, по умолчанию 10 |
| `MIGRATION_TEST_DATABASE_URL` | Необязательная disposable PostgreSQL-БД для integration test |
| `SKIP_COMPETITION_START_DATE_CHECK` | Тестовый режим: `true` разрешает работу до даты начала конкурса; дата окончания продолжает проверяться |

Создание секретов:

```bash
openssl rand -base64 48
```

`SKIP_COMPETITION_START_DATE_CHECK=true` используйте только на тестовом окружении. В production не задавайте переменную или установите `false`.

## Локальный запуск

```bash
docker run --rm --name gosup-postgres \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=gosup \
  -p 5432:5432 postgres:16
cp .env.example .env.local
npm ci
npm run db:migrate
npm run dev
```

Проверки:

```bash
npm run lint
npm test
npm run build
curl http://localhost:3000/api/health
```

`GET /api/health` возвращает `{"status":"ok"}` при доступной БД.

## Миграции

```bash
npm run db:migrate
```

Не изменяйте применённые `0000`–`0002`. Миграция `0003_phase0_schema_repair.sql` идемпотентно переносит пользовательские поля в Drizzle schema, добавляет retry metadata и таблицы рассылок. Она использует `IF EXISTS`/`IF NOT EXISTS` и не удаляет пользователей или активности.

Integration test запускается только на отдельной пустой БД:

```bash
MIGRATION_TEST_DATABASE_URL=postgresql://... npm test
```

Никогда не указывайте production-БД в `MIGRATION_TEST_DATABASE_URL`.

## Telegram webhook

Регистрация:

```bash
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=${APP_URL}/api/bot/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -d 'allowed_updates=["message"]'
```

Проверка:

```bash
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

Webhook принимает секрет только в `X-Telegram-Bot-Api-Secret-Token`. Команды: `/start`, `/rules`, `/app`, `/progress`, `/today`, `/achievements`, `/notifications`.

## Cron и Railway

Локальный вызов:

```bash
curl -X POST http://localhost:3000/api/cron/reminders \
  -H "Authorization: Bearer ${CRON_SECRET}"
curl -X POST http://localhost:3000/api/cron/weekly-report \
  -H "Authorization: Bearer ${CRON_SECRET}"
curl -X POST http://localhost:3000/api/cron/group-feed \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

В Railway создайте три cron service/job:

- reminders: каждые 10–15 минут, `POST /api/cron/reminders`;
- weekly report: раз в неделю, `POST /api/cron/weekly-report`.
- group feed: каждые 5 минут, `POST /api/cron/group-feed` (достижения уйдут на ближайшем запуске,
  активности будут собраны в дайджест; расписание публикаций вычисляется в timezone конкурса).

Оба запроса передают `Authorization: Bearer <CRON_SECRET>`. Reminder service сам сравнивает московское время с `contest_settings.reminder_time`. Failed reminders и отчёты повторяются; sent-записи идемпотентны.

Для application service задайте все обязательные переменные, подключите PostgreSQL reference `DATABASE_URL` и проверьте:

1. `preDeployCommand` завершил `npm run db:migrate`;
2. `/api/health` отвечает 200;
3. webhook указывает на актуальный `APP_URL`;
4. Mini App открывается из кнопки бота;
5. cron получает 2xx.

## Администрирование

Администратор определяется только по `ADMIN_TELEGRAM_IDS`. API поддерживает:

- участников, отключение и настройки уведомлений;
- создание, редактирование, модерацию и удаление активностей с пересчётом;
- ручную выдачу и отзыв достижений с обязательным комментарием;
- настройки конкурса, напоминаний и отчётов;
- CSV `Participants`, `Activities`, `Achievements`, `Audit`;
- preview и массовую рассылку;
- неизменяемый snapshot и криптографический розыгрыш по `runId`;
- итоговый отчёт.

Глобальное удаление пользователей удалено. Новый конкурс создаётся архивированием текущего конкурса и атомарным созданием настроек, тем и аудита.

## Групповая Telegram-лента

Лента публикует дайджесты подтверждённых активностей, новые автоматические и ручные бейджи,
Top-10 дважды в день и вечернюю статистику. В `contest_settings.report_chat_id` укажите ID группы;
если поле пусто, используется `TELEGRAM_REPORT_CHAT_ID`. ID супергруппы обычно начинается с `-100`.
Добавьте бота в группу и разрешите ему отправлять сообщения. Отдельный group chat env не нужен.
Если Telegram преобразует группу в супергруппу, бот автоматически повторит отправку на новый `chat_id`.

События сначала атомарно записываются в `group_feed_events`, поэтому сбой Telegram не ломает Mini App.
Уникальный `dedupe_key` исключает повторную постановку, cron захватывает строки через
`FOR UPDATE SKIP LOCKED`, восстанавливает processing lease через 10 минут и делает не более пяти попыток.
Telegram `retry_after` учитывается. Расписание и переключатели редактируются в существующей вкладке
администратора «Настройки». Переменные `LEADERBOARD_DAY_TIME_MSK`, `LEADERBOARD_EVENING_TIME_MSK` и
`DAILY_SUMMARY_TIME_MSK` переопределяют соответствующее расписание и всегда интерпретируются как
московское время; cron group feed должен запускаться не реже одного раза в 5 минут. При пустом chat ID
cron безопасно отвечает `GROUP_CHAT_NOT_CONFIGURED`.

## Безопасность

- Клиент не передаёт дату пользовательской активности.
- В прогресс входят только `approved`-активности.
- CSV значения с `=`, `+`, `-`, `@` экранируются от formula injection.
- `DEV_TELEGRAM_USER_ID` не работает при `NODE_ENV=production`.
- Не запускайте destructive SQL и migration integration tests на production.
