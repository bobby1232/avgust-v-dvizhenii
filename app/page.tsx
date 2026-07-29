"use client";

import { useEffect, useMemo, useState } from "react";

type Tab = "today" | "progress" | "community" | "admin";
type Activity = { id: number; title: string; meta: string; icon: string };
type User = { name: string; department: string; registeredAt: string };

const USER_KEY = "avgust-user-v1";
const ACTIVITIES_KEY = "avgust-activities-v1";
const CHECKIN_KEY = "avgust-checkin-v1";

const emptyWeek = [
  { day: "Пн", date: "1" },
  { day: "Вт", date: "2" },
  { day: "Ср", date: "3" },
  { day: "Чт", date: "4" },
  { day: "Пт", date: "5" },
  { day: "Сб", date: "6" },
  { day: "Вс", date: "7", today: true },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("today");
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [checkedIn, setCheckedIn] = useState(false);
  const [activity, setActivity] = useState("Бег");
  const [note, setNote] = useState("");
  const [showCheckin, setShowCheckin] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [toast, setToast] = useState("");
  const [schedule, setSchedule] = useState("20:30");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem(USER_KEY);
      const savedActivities = localStorage.getItem(ACTIVITIES_KEY);
      const savedCheckin = localStorage.getItem(CHECKIN_KEY);

      if (savedUser) setUser(JSON.parse(savedUser));
      if (savedActivities) setActivities(JSON.parse(savedActivities));
      if (savedCheckin === new Date().toISOString().slice(0, 10)) setCheckedIn(true);
      if (!savedUser) setShowRegistration(true);
    } catch {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(ACTIVITIES_KEY);
      localStorage.removeItem(CHECKIN_KEY);
      setShowRegistration(true);
    } finally {
      setHydrated(true);
    }
  }, []);

  const days = activities.length;
  const streak = activities.length;
  const initials = user?.name
    ? user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
    : "?";

  const title = useMemo(() => {
    if (tab === "progress") return "Мой август";
    if (tab === "community") return "Вместе";
    if (tab === "admin") return "Управление";
    return user ? `Привет, ${user.name.split(" ")[0]}` : "Август в движении";
  }, [tab, user]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  function registerUser() {
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      showToast("Укажите имя участника");
      return;
    }

    const nextUser: User = {
      name: cleanName,
      department: department.trim(),
      registeredAt: new Date().toISOString(),
    };
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
    setShowRegistration(false);
    showToast("Регистрация завершена");
  }

  function submitCheckin() {
    if (checkedIn || !user) return;
    const nextActivity: Activity = {
      id: Date.now(),
      title: `${activity}${note.trim() ? ` · ${note.trim()}` : ""}`,
      meta: `${new Date().toLocaleDateString("ru-RU")} · подтверждено`,
      icon: "✓",
    };
    const nextActivities = [nextActivity, ...activities];
    setActivities(nextActivities);
    setCheckedIn(true);
    setShowCheckin(false);
    setNote("");
    localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(nextActivities));
    localStorage.setItem(CHECKIN_KEY, new Date().toISOString().slice(0, 10));
    showToast("Активность засчитана");
  }

  function resetContest() {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ACTIVITIES_KEY);
    localStorage.removeItem(CHECKIN_KEY);
    setUser(null);
    setActivities([]);
    setCheckedIn(false);
    setName("");
    setDepartment("");
    setShowReset(false);
    setShowRegistration(true);
    setTab("today");
    showToast("Конкурс полностью очищен");
  }

  function downloadCsv() {
    const rows = [["Участник", "Подразделение", "Активных дней", "Дата регистрации"]];
    if (user) rows.push([user.name, user.department || "—", String(days), new Date(user.registeredAt).toLocaleString("ru-RU")]);
    const csv = "\uFEFF" + rows.map((row) => row.join(";")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = "avgust-v-dvizhenii.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (!hydrated) return <main className="app-shell" />;

  return (
    <main className="app-shell">
      <section className="phone">
        <header className="topbar">
          <button className="brand" onClick={() => setTab("today")} aria-label="На главную">
            <span className="brand-mark">А</span>
            <span>АВГУСТ<br /><b>В ДВИЖЕНИИ</b></span>
          </button>
          <button className="avatar" onClick={() => user ? setTab("progress") : setShowRegistration(true)} aria-label="Открыть профиль">{initials}</button>
        </header>

        <div className="page-heading">
          <p>{tab === "admin" ? "Панель организатора" : "Новый конкурс · чистый старт"}</p>
          <h1>{title}</h1>
        </div>

        {tab === "today" && (
          <div className="view">
            <section className="hero-card">
              <div className="hero-top">
                <div>
                  <span className="eyebrow">{checkedIn ? "Сегодня готово" : "Начните новую серию"}</span>
                  <h2><strong>{streak}</strong> дней подряд</h2>
                </div>
                <div className="streak-orbit"><span>↗</span></div>
              </div>
              <div className="week-row">
                {emptyWeek.map((item) => (
                  <div className={`day ${item.today ? "today" : ""} ${checkedIn && item.today ? "done" : ""}`} key={item.date}>
                    <span>{item.day}</span><b>{checkedIn && item.today ? "✓" : item.date}</b>
                  </div>
                ))}
              </div>
              <button className={`primary ${checkedIn ? "complete" : ""}`} onClick={() => user ? !checkedIn && setShowCheckin(true) : setShowRegistration(true)}>
                {!user ? "Зарегистрироваться" : checkedIn ? "✓ Активность уже засчитана" : "Отметить активность"}
              </button>
              <small>{user ? "Одна зачётная отметка в день" : "Сначала создайте профиль участника"}</small>
            </section>

            <section className="section">
              <div className="section-title"><h3>Ваш прогресс</h3><button onClick={() => setTab("progress")}>Подробнее</button></div>
              <div className="stats-grid">
                <article><span>Активных дней</span><b>{days}<i>/31</i></b><div className="bar"><i style={{ width: `${Math.min(100, days / 31 * 100)}%` }} /></div></article>
                <article><span>До розыгрыша</span><b>{Math.max(0, 20 - days)}<i>дней</i></b><p>Нужно 20 активных дней</p></article>
              </div>
            </section>
          </div>
        )}

        {tab === "progress" && (
          <div className="view">
            <section className="progress-hero">
              <div className="ring" style={{ "--progress": `${Math.min(360, days / 31 * 360)}deg` } as React.CSSProperties}><div><b>{days}</b><span>из 31 дня</span></div></div>
              <div><span className="eyebrow">{user ? "Вы зарегистрированы" : "Нет профиля"}</span><h2>{user?.name || "Создайте профиль"}</h2><p>{user?.department || "Подразделение не указано"}</p></div>
            </section>
            <section className="section">
              <div className="section-title"><h3>Последняя активность</h3></div>
              <div className="activity-list">
                {activities.length === 0 && <article><span>○</span><div><b>Пока нет отметок</b><small>Первая активность появится здесь</small></div></article>}
                {activities.slice(0, 10).map((item) => <article key={item.id}><span>{item.icon}</span><div><b>{item.title}</b><small>{item.meta}</small></div><i>✓</i></article>)}
              </div>
            </section>
          </div>
        )}

        {tab === "community" && (
          <div className="view">
            <section className="report-card">
              <span className="eyebrow">Конкурс запущен заново</span>
              <h2>Начинаем<br />с чистого листа</h2>
              <div className="report-stats"><div><b>{user ? 1 : 0}</b><span>зарегистрировано</span></div><div><b>{days}</b><span>активных дней вместе</span></div></div>
            </section>
            <section className="section">
              <div className="section-title"><h3>Участники</h3><span>Демо-данные удалены</span></div>
              <div className="people-list">
                {!user && <article><span className="person-avatar">?</span><div><b>Участников пока нет</b><small>Зарегистрируйтесь первым</small></div></article>}
                {user && <article><span className="person-avatar">{initials.slice(0, 1)}</span><div><b>{user.name}</b><small>{days} активных дней</small></div><span className="series">↗ {streak} дней</span></article>}
              </div>
            </section>
          </div>
        )}

        {tab === "admin" && (
          <div className="view admin-view">
            <section className="admin-summary">
              <article><span>В игре</span><b>{user ? 1 : 0}</b><small>реальных регистраций в этом браузере</small></article>
              <article><span>Отметок</span><b>{days}</b><small>без демонстрационных данных</small></article>
            </section>
            <section className="section">
              <div className="section-title"><h3>Настройки проекта</h3></div>
              <div className="settings-list">
                <label><div><b>Вечернее напоминание</b><small>Ежедневно</small></div><input aria-label="Время напоминания" type="time" value={schedule} onChange={(e) => setSchedule(e.target.value)} /></label>
                <button onClick={downloadCsv}><span>⇩</span><div><b>Выгрузить статистику</b><small>CSV</small></div><i>›</i></button>
                <button onClick={() => setShowReset(true)} style={{ color: "#a52a2a" }}><span>↺</span><div><b>Начать конкурс заново</b><small>Удалить профиль и все отметки</small></div><i>›</i></button>
              </div>
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

      {showRegistration && <div className="modal-backdrop">
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="registration-title">
          {user && <button className="modal-close" onClick={() => setShowRegistration(false)} aria-label="Закрыть">×</button>}
          <span className="eyebrow">Регистрация участника</span>
          <h2 id="registration-title">Давайте знакомиться</h2>
          <label className="note-field">Имя и фамилия<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Илья Рощупкин" /></label>
          <label className="note-field">Подразделение<input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Необязательно" /></label>
          <button className="primary" onClick={registerUser}>Вступить в конкурс</button>
          <small style={{ display: "block", marginTop: 12, textAlign: "center" }}>Сейчас профиль сохраняется только в этом браузере</small>
        </section>
      </div>}

      {showCheckin && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowCheckin(false)}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="checkin-title">
          <button className="modal-close" onClick={() => setShowCheckin(false)} aria-label="Закрыть">×</button>
          <span className="eyebrow">Активность дня</span><h2 id="checkin-title">Что сегодня делали?</h2>
          <div className="activity-options">{["Бег", "Прогулка", "Йога", "Велосипед"].map((item) => <button className={activity === item ? "active" : ""} onClick={() => setActivity(item)} key={item}>{item}</button>)}</div>
          <label className="note-field">Коротко об активности<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: 5 км в парке" /></label>
          <button className="primary" onClick={submitCheckin}>Засчитать день</button>
        </section>
      </div>}

      {showReset && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowReset(false)}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
          <button className="modal-close" onClick={() => setShowReset(false)} aria-label="Закрыть">×</button>
          <span className="eyebrow">Необратимое действие</span><h2 id="reset-title">Начать конкурс заново?</h2>
          <p>Будут удалены профиль участника и все отметки активности в этом браузере.</p>
          <button className="primary" onClick={resetContest}>Да, очистить всё</button>
          <button onClick={() => setShowReset(false)} style={{ width: "100%", marginTop: 10, border: 0, background: "transparent", padding: 12, cursor: "pointer" }}>Отмена</button>
        </section>
      </div>}

      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}
