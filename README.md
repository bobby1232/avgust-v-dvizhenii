# Август в движении

Telegram Mini App для общего конкурса активности. React-интерфейс обращается только к серверным API; PostgreSQL в Railway является единственным источником профилей, отметок и статистики. Drizzle описывает схему и применяет версионированные миграции, а `pg.Pool` переиспользуется между запросами.

## Архитектура и данные

- `app/api` — Telegram-аутентификация, профиль, регистрация, активности, сообщество, администрирование и healthcheck.
- `db/schema.ts` — PostgreSQL-схема Drizzle; `db/client.ts` — ограниченный пул соединений.
- `lib/telegram.ts` проверяет HMAC-подпись и срок жизни Telegram WebApp `initData` до выдачи сессии.
- Сессия подписана HMAC-SHA256 и находится в `httpOnly`, `sameSite=lax`, production-`secure` cookie. `initData` и Telegram ID не сохраняются браузером.
- Администратор определяется при каждом запросе по серверному `ADMIN_TELEGRAM_IDS`; значения `role`, `isAdmin` и Telegram ID от клиента не принимаются.

Таблицы: `competitions` (один активный конкурс обеспечен partial unique index), `users` (уникальный `telegram_id` типа `bigint`), `activities` (внешние ключи и несколько активностей пользователя за день), `audit_logs` (JSONB-журнал операций). Несколько активностей сохраняются в истории отдельно, но в прогрессе дата учитывается как один активный день.

## Переменные окружения

Скопируйте `.env.example` в `.env.local`:

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | Единственная строка подключения PostgreSQL |
| `TELEGRAM_BOT_TOKEN` | Токен бота для проверки `initData` |
| `ADMIN_TELEGRAM_IDS` | Telegram ID администраторов через запятую |
| `SESSION_SECRET` | Случайная строка не короче 32 символов |
| `DEV_TELEGRAM_USER_ID` | Необязательный локальный ID; игнорируется в production |
| `DATABASE_POOL_SIZE` | Необязательный размер пула, по умолчанию 10 |

Не коммитьте `.env*` с секретами. Создайте `SESSION_SECRET`, например, командой `openssl rand -base64 48`.

## Локальный запуск

```bash
# тестовая локальная БД (не production)
docker run --rm --name avgust-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=avgust -p 5432:5432 postgres:16
cp .env.example .env.local
npm ci
npm run db:migrate
npm run dev
```

Заполните `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN`; либо задайте `DEV_TELEGRAM_USER_ID` для разработки вне Telegram. Development fallback отключён при `NODE_ENV=production`.

Команды: `npm run db:generate` создаёт миграцию после изменения схемы, `npm run db:migrate` применяет её, `npm run lint`, `npm test`, `npm run build` проверяют проект. Миграции не запускаются во время Docker build.

## API

- `POST /api/auth/telegram`, `GET /api/me`, `POST /api/register`
- `GET|POST /api/activities`, `GET /api/community`
- `GET /api/admin/stats`, `GET /api/admin/users`, `POST /api/admin/reset-contest`
- `GET /api/health` выполняет `SELECT 1`, возвращая 200 или безопасный 503.

Регистрация идемпотентна. Допустимые активности: бег, прогулка, йога и велосипед. Агрегаты сообщества получаются одним join без N+1.

### Глобальный сброс

Только серверный администратор может отправить точную фразу `НАЧАТЬ ЗАНОВО`. В одной транзакции с PostgreSQL advisory lock удаляются активности и пользователи, закрывается старый конкурс, создаётся новый активный конкурс и пишется аудит. При ошибке всё откатывается. После сброса даже администратор регистрируется заново; его роль снова выводится из окружения.

## Развертывание с PostgreSQL на Railway

1. Откройте текущий Railway project и добавьте PostgreSQL service.
2. Передайте reference-переменную `DATABASE_URL` PostgreSQL service в application service.
3. Добавьте в application service `TELEGRAM_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, случайный `SESSION_SECRET`.
4. Запустите новый deployment.
5. Убедитесь, что pre-deploy `npm run db:migrate` успешно завершился.
6. Проверьте `https://<домен>/api/health` — ожидается `{"status":"ok"}`.
7. Откройте Mini App в Telegram, зарегистрируйтесь и создайте активность.
8. Под администратором проверьте статистику и глобальный сброс с подтверждением.

`railway.json` сохраняет Dockerfile builder, restart policy и использует `/api/health`. PostgreSQL credentials в репозитории не нужны.

## Типовые ошибки

- 503 healthcheck: проверьте reference `DATABASE_URL`, доступность PostgreSQL и TLS.
- «Сервис временно недоступен»: проверьте, что pre-deploy миграция выполнена.
- Ошибка Telegram: проверьте токен бота, запуск именно из Mini App и актуальность `initData` (не старше суток).
- Нет раздела «Админ»: добавьте числовой ID без `@` в `ADMIN_TELEGRAM_IDS` и повторно войдите.
- В один день можно добавить несколько активностей; для серии и прогресса этот день всё равно учитывается один раз.
