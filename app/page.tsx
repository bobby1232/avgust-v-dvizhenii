"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Tab = "today" | "progress" | "community" | "admin";
type Participant = {
  id: string;
  name: string;
  telegramUsername: string | null;
  activeDays: number;
  streak: number;
  maxStreak: number;
  activityDates: string[];
};
type Activity = {
  id: string;
  activityType: string;
  note: string | null;
  activityDate: string;
  createdAt: string;
};
type AppState = {
  today: string;
  participant: Participant | null;
  participants: Participant[];
  recentActivities: Activity[];
  stats: {
    totalParticipants: number;
    totalDays: number;
    todayCheckins: number;
  };
};

type TelegramUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
        expand?: () => void;
        initDataUnsafe?: { user?: TelegramUser };
      };
    };
  }
}

const emptyState: AppState = {
  today: "",
  participant: null,
  participants: [],
  recentActivities: [],
  stats: { totalParticipants: 0, totalDays: 0, todayCheckins: 0 },
};

const activityOptions = ["Бег", "Прогулка", "Йога", "Велосипед", "Тренировка", "Другое"];

function parseDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", ...options }).format(parseDate(value));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "У";
}

function buildWeek(today: string, activityDates: string[]) {
  if (!today) return [];
  const current = parseDate(today);
  const day = current.getUTCDay() || 7;
  const monday = new Date(current);
  monday.setUTCDate(current.getUTCDate() - day + 1);
  const completed = new Set(activityDates);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      day: new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" })
        .format(date)
        .replace(".", ""),
      date: date.getUTCDate(),
      done: completed.has(key),
      today: key === today,
    };
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "Не удалось выполнить запрос.");
  return payload;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("today");
  const [data, setData] = useState<AppState>(emptyState);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestBusy, setRequestBusy] = useState(false);
  const [fatalError, setFatalError] = useState("");
  const [toast, setToast] = useState("");
  const [showCheckin, setShowCheckin] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [activity, setActivity] = useState(activityOptions[0]);
  const [note, setNote] = useState("");
  const [registrationName, setRegistrationName] = useState("");
  const [registrationUsername, setRegistrationUsername] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [formError, setFormError] = useState("");

  async function loadState(id: string | null, silent = false) {
    if (!silent) setLoading(true);
    setFatalError("");

    try {
      const query = id ? `?participantId=${encodeURIComponent(id)}` : "";
      const response = await fetch(`/api/state${query}`, { cache: "no-store" });
      const payload = (await readJson(response)) as unknown as AppState;
      setData(payload);

      if (id && !payload.participant) {
        localStorage.removeItem("avgust_participant_id");
        setParticipantId(null);
        setShowRegistration(true);
      } else if (!payload.participant) {
        setShowRegistration(true);
      }
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : "Не удалось загрузить данные.");
      setShowRegistration(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const telegram = window.Telegram?.WebApp;
    telegram?.ready?.();
    telegram?.expand?.();
    const telegramUser = telegram?.initDataUnsafe?.user;

    if (telegramUser) {
      const fullName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" ");
      if (fullName) setRegistrationName(fullName);
      if (telegramUser.username) setRegistrationUsername(telegramUser.username);
      if (telegramUser.id) setTelegramId(String(telegramUser.id));
    }

    const storedId = localStorage.getItem("avgust_participant_id");
    setParticipantId(storedId);
    void loadState(storedId);
  }, []);

  const participant = data.participant;
  const checkedIn = Boolean(participant && data.today && participant.activityDates.includes(data.today));
  const week = useMemo(
    () => buildWeek(data.today, participant?.activityDates ?? []),
    [data.today, participant?.activityDates],
  );
  const earnedBadges = Math.min(
    5,
    [1, 7, 10, 20, 31].filter((target) => (participant?.activeDays ?? 0) >= target).length,
  );
  const goalProgress = Math.min(100, Math.round((data.stats.totalDays / 2500) * 100));

  const title = useMemo(() => {
    if (tab === "progress") return "Мой август";
    if (tab === "community") return "Вместе";
    if (tab === "admin") return "Управление";
    return participant ? `Привет, ${participant.name.split(" ")[0]}` : "Август в движении";
  }, [participant, tab]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestBusy(true);
    setFormError("");

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: registrationName,
          telegramUsername: registrationUsername,
          telegramId,
        }),
      });
      const payload = (await readJson(response)) as unknown as {
        participant: { id: string };
        restored: boolean;
      };

      localStorage.setItem("avgust_participant_id", payload.participant.id);
      setParticipantId(payload.participant.id);
      setShowRegistration(false);
      await loadState(payload.participant.id, true);
      showToast(payload.restored ? "Профиль восстановлен" : "Регистрация завершена");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Не удалось зарегистрироваться.");
    } finally {
      setRequestBusy(false);
    }
  }

  async function submitCheckin() {
    if (!participantId || checkedIn) return;
    setRequestBusy(true);
    setFormError("");

    try {
      const response = await fetch("/api/checkins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ participantId, activityType: activity, note }),
      });
      await readJson(response);
      setShowCheckin(false);
      setNote("");
      await loadState(participantId, true);
      showToast("Активность засчитана. Серия продолжается!");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Не удалось засчитать активность.");
    } finally {
      setRequestBusy(false);
    }
  }

  function downloadCsv() {
    const rows: Array<Array<string | number>> = [
      ["Участник", "Telegram", "Активных дней", "Текущая серия", "Максимальная серия"],
      ...data.participants.map((item) => [
        item.name,
        item.telegramUsername ? `@${item.telegramUsername}` : "",
        item.activeDays,
        item.streak,
        item.maxStreak,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\n")}`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `avgust-v-dvizhenii-${data.today || "export"}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Выгрузка готова");
  }

  async function resetContest() {
    const confirmed = window.confirm(
      "Будут безвозвратно удалены все участники и все отметки. Конкурс начнётся с нуля. Продолжить?",
    );
    if (!confirmed) return;

    const secret = window.prompt("Введите ADMIN_SECRET из Railway:");
    if (!secret) return;

    setRequestBusy(true);
    try {
      const response = await fetch("/api/admin/reset", {
        method: "DELETE",
        headers: { "x-admin-secret": secret },
      });
      await readJson(response);
      localStorage.removeItem("avgust_participant_id");
      setParticipantId(null);
      setData(emptyState);
      setTab("today");
      setShowRegistration(true);
      await loadState(null, true);
      showToast("Конкурс очищен и запущен заново");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось очистить конкурс.");
    } finally {
      setRequestBusy(false);
    }
  }

  const badgeDefinitions = [
    { icon: "✦", title: "Первый шаг", note: "1 активный день", target: 1 },
    { icon: "7", title: "Неделя в ритме", note: "7 активных дней", target: 7 },
    { icon: "10", title: "Десятка", note: "10 активных дней", target: 10 },
    { icon: "20", title: "В розыгрыше", note: "20 активных дней", target: 20 },
    { icon: "31", title: "Весь август", note: "31 активный день", target: 31 },
  ];

  return (
    <main className="app-shell">
      <section className="phone">
        <header className="topbar">
          <button className="brand" onClick={() => setTab("today")} aria-label="На главную">
            <span className="brand-mark">А</span>
            <span>АВГУСТ<br /><b>В ДВИЖЕНИИ</b></span>
          </button>
          <button
            className="avatar"
            onClick={() => participant ? setTab("progress") : setShowRegistration(true)}
            aria-label="Открыть профиль"
          >
            {participant ? initials(participant.name) : "+"}
          </button>
        </header>

        <div className="page-heading">
          <p>
            {tab === "admin"
              ? "Панель организатора"
              : data.today
                ? formatDate(data.today, { day: "numeric", month: "long", weekday: "long" })
                : "Спортивный конкурс"}
          </p>
          <h1>{title}</h1>
        </div>

        {fatalError && (
          <section className="error-card">
            <b>Приложение не подключено к базе</b>
            <p>{fatalError}</p>
            <button onClick={() => void loadState(participantId)}>Повторить</button>
          </section>
        )}

        {loading && !fatalError && <div className="loading-card">Загружаем данные конкурса…</div>}

        {!loading && !fatalError && tab === "today" && (
          <div className="view">
            <section className="hero-card">
              <div className="hero-top">
                <div>
                  <span className="eyebrow">{checkedIn ? "Сегодня готово" : "Серия продолжается"}</span>
                  <h2><strong>{participant?.streak ?? 0}</strong> дней подряд</h2>
                </div>
                <div className="streak-orbit"><span>↗</span></div>
              </div>
              <div className="week-row">
                {week.map((item) => (
                  <div className={`day ${item.today ? "today" : ""} ${item.done ? "done" : ""}`} key={item.key}>
                    <span>{item.day}</span>
                    <b>{item.done ? "✓" : item.date}</b>
                  </div>
                ))}
              </div>
              <button
                className={`primary ${checkedIn ? "complete" : ""}`}
                disabled={requestBusy || checkedIn}
                onClick={() => participant ? setShowCheckin(true) : setShowRegistration(true)}
              >
                {checkedIn ? "✓ Активность уже засчитана" : participant ? "Отметить активность" : "Зарегистрироваться"}
              </button>
              <small>{checkedIn ? "Следующая отметка будет доступна завтра" : "Одна зачётная отметка в день"}</small>
            </section>

            <section className="section">
              <div className="section-title"><h3>Ваш прогресс</h3><button onClick={() => setTab("progress")}>Подробнее</button></div>
              <div className="stats-grid">
                <article><span>Активных дней</span><b>{participant?.activeDays ?? 0}<i>/31</i></b><div className="bar"><i style={{ width: `${Math.min(100, ((participant?.activeDays ?? 0) / 31) * 100)}%` }} /></div></article>
                <article><span>До розыгрыша</span><b>{Math.max(0, 20 - (participant?.activeDays ?? 0))}<i>дней</i></b><p>Нужно 20 активных дней</p></article>
              </div>
            </section>

            <section className="theme-card">
              <span className="theme-number">01</span>
              <div><span className="eyebrow">Старт конкурса</span><h3>Двигаемся вместе</h3><p>После очистки все участники начинают с нулевого прогресса.</p></div>
            </section>
          </div>
        )}

        {!loading && !fatalError && tab === "progress" && (
          <div className="view">
            <section className="progress-hero">
              <div className="ring" style={{ "--progress": `${((participant?.activeDays ?? 0) / 31) * 360}deg` } as React.CSSProperties}><div><b>{participant?.activeDays ?? 0}</b><span>из 31 дня</span></div></div>
              <div><span className="eyebrow">{participant ? "Вы в игре" : "Нет регистрации"}</span><h2>{participant ? "Продолжайте в своём темпе" : "Создайте профиль"}</h2><p>До участия в розыгрыше — {Math.max(0, 20 - (participant?.activeDays ?? 0))} активных дней.</p></div>
            </section>
            <div className="triple-stats">
              <article><b>{participant?.streak ?? 0}</b><span>текущая серия</span></article>
              <article><b>{participant?.maxStreak ?? 0}</b><span>макс. серия</span></article>
              <article><b>{earnedBadges}</b><span>достижения</span></article>
            </div>
            <section className="section">
              <div className="section-title"><h3>Достижения</h3><span>{earnedBadges} из 5</span></div>
              <div className="badges">
                {badgeDefinitions.map((badge) => <article className={(participant?.activeDays ?? 0) >= badge.target ? "" : "locked"} key={badge.title}><div>{badge.icon}</div><b>{badge.title}</b><span>{badge.note}</span></article>)}
              </div>
            </section>
            <section className="section">
              <div className="section-title"><h3>Последняя активность</h3></div>
              <div className="activity-list">
                {data.recentActivities.length === 0 && <div className="empty-state">Пока нет ни одной отметки.</div>}
                {data.recentActivities.slice(0, 5).map((item) => <article key={item.id}><span>✓</span><div><b>{item.activityType}{item.note ? ` · ${item.note}` : ""}</b><small>{formatDate(item.activityDate, { day: "numeric", month: "long" })}</small></div><i>✓</i></article>)}
              </div>
            </section>
          </div>
        )}

        {!loading && !fatalError && tab === "community" && (
          <div className="view">
            <section className="report-card">
              <span className="eyebrow">Результаты конкурса</span>
              <h2>Каждый движется<br />в своём ритме</h2>
              <div className="report-stats"><div><b>{data.stats.totalParticipants}</b><span>участников зарегистрировано</span></div><div><b>{data.stats.totalDays.toLocaleString("ru")}</b><span>активных дней вместе</span></div></div>
              <div className="collective-goal"><span>Общая цель · 2 500 дней</span><b>{goalProgress}%</b><i><em style={{ width: `${goalProgress}%` }} /></i></div>
            </section>
            <section className="section">
              <div className="section-title"><h3>Участники</h3><span>Реальные данные из PostgreSQL</span></div>
              <div className="people-list">
                {data.participants.length === 0 && <div className="empty-state">Пока никто не зарегистрировался.</div>}
                {data.participants.map((person) => <article key={person.id}><span className="person-avatar">{initials(person.name)}</span><div><b>{person.name}{person.id === participantId ? " · Вы" : ""}</b><small>{person.activeDays} активных дней{person.telegramUsername ? ` · @${person.telegramUsername}` : ""}</small></div><span className="series">↗ {person.streak} дней</span></article>)}
              </div>
            </section>
          </div>
        )}

        {!loading && !fatalError && tab === "admin" && (
          <div className="view admin-view">
            <section className="admin-summary">
              <article><span>Регистраций</span><b>{data.stats.totalParticipants}</b><small>в текущем конкурсе</small></article>
              <article><span>Отметок сегодня</span><b>{data.stats.todayCheckins}</b><small>{data.stats.totalParticipants ? Math.round((data.stats.todayCheckins / data.stats.totalParticipants) * 100) : 0}% участников</small></article>
            </section>
            <section className="section">
              <div className="section-title"><h3>Управление данными</h3></div>
              <div className="settings-list">
                <button onClick={downloadCsv}><span>⇩</span><div><b>Выгрузить статистику</b><small>Фактические участники и прогресс в CSV</small></div><i>›</i></button>
                <button className="danger-action" disabled={requestBusy} onClick={() => void resetContest()}><span>×</span><div><b>Очистить весь конкурс</b><small>Удалить участников и активности, начать с нуля</small></div><i>›</i></button>
              </div>
            </section>
            <section className="admin-note">
              <b>Защита очистки</b>
              <p>Кнопка запрашивает секрет администратора. Его значение задаётся в Railway переменной <code>ADMIN_SECRET</code>.</p>
            </section>
          </div>
        )}

        <nav className="bottom-nav" aria-label="Основная навигация">
          <button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}><span>⌂</span>Сегодня</button>
          <button className={tab === "progress" ? "active" : ""} onClick={() => setTab("progress")}><span>◴</span>Прогресс</button>
          <button className={tab === "community" ? "active" : ""} onClick={() => setTab("community")}><span>◌</span>Вместе</button>
          <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}><span>⌘</span>Админ</button>
        </nav>
      </section>

      {showRegistration && !fatalError && (
        <div className="modal-backdrop registration-backdrop">
          <form className="modal" onSubmit={submitRegistration}>
            <span className="eyebrow">Регистрация участника</span>
            <h2>Как вас записать?</h2>
            <p className="modal-copy">Профиль нужен, чтобы сохранять ежедневные отметки и прогресс в общей базе.</p>
            <label className="form-field">Имя и фамилия<input autoFocus value={registrationName} onChange={(event) => setRegistrationName(event.target.value)} placeholder="Иван Петров" maxLength={80} required /></label>
            <label className="form-field">Telegram username <small>необязательно</small><input value={registrationUsername} onChange={(event) => setRegistrationUsername(event.target.value)} placeholder="username без @" maxLength={32} /></label>
            {formError && <div className="form-error">{formError}</div>}
            <button className="primary" disabled={requestBusy} type="submit">{requestBusy ? "Сохраняем…" : "Вступить в конкурс"}</button>
          </form>
        </div>
      )}

      {showCheckin && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowCheckin(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="checkin-title">
            <button className="modal-close" onClick={() => setShowCheckin(false)} aria-label="Закрыть">×</button>
            <span className="eyebrow">{formatDate(data.today, { day: "numeric", month: "long" })}</span><h2 id="checkin-title">Что сегодня делали?</h2>
            <div className="activity-options">{activityOptions.map((item) => <button className={activity === item ? "active" : ""} onClick={() => setActivity(item)} key={item}>{item}</button>)}</div>
            <label className="note-field">Коротко об активности<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Например: 5 км в парке" maxLength={200} /></label>
            {formError && <div className="form-error">{formError}</div>}
            <button className="primary" disabled={requestBusy} onClick={() => void submitCheckin()}>{requestBusy ? "Сохраняем…" : "Засчитать день"}</button>
          </section>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
