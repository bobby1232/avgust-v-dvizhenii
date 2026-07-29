"use client";

import { useMemo, useState } from "react";

type Tab = "today" | "progress" | "community" | "admin";
type Activity = { id: number; title: string; meta: string; icon: string; active?: boolean };

const week = [
  { day: "Пн", date: "12", done: true },
  { day: "Вт", date: "13", done: true },
  { day: "Ср", date: "14", done: true },
  { day: "Чт", date: "15", done: true },
  { day: "Пт", date: "16", done: true },
  { day: "Сб", date: "17", done: true },
  { day: "Вс", date: "18", done: false, today: true },
];

const people = [
  { name: "Лена К.", days: 18, streak: 18, color: "#f0b45d" },
  { name: "Саша М.", days: 17, streak: 12, color: "#ef8354" },
  { name: "Вы", days: 16, streak: 7, color: "#b7d75b" },
  { name: "Ира П.", days: 15, streak: 9, color: "#8fc9c2" },
  { name: "Дима Р.", days: 13, streak: 5, color: "#a8a1ef" },
];

const badges = [
  { icon: "✦", title: "Первый шаг", note: "Первая отметка", earned: true },
  { icon: "7", title: "Неделя в ритме", note: "Серия 7 дней", earned: true },
  { icon: "10", title: "Десятка", note: "10 активных дней", earned: true },
  { icon: "↗", title: "Новый маршрут", note: "Новый вид активности", earned: false },
  { icon: "31", title: "Весь август", note: "31 день без пропусков", earned: false },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("today");
  const [checkedIn, setCheckedIn] = useState(false);
  const [activity, setActivity] = useState("Бег");
  const [note, setNote] = useState("");
  const [showCheckin, setShowCheckin] = useState(false);
  const [toast, setToast] = useState("");
  const [adminFilter, setAdminFilter] = useState("Все");
  const [schedule, setSchedule] = useState("20:30");
  const [activities, setActivities] = useState<Activity[]>([
    { id: 1, title: "Бег · 4,2 км", meta: "Сегодня, 08:10 · подтверждено", icon: "🏃", active: true },
    { id: 2, title: "Йога · 25 мин", meta: "17 августа, 19:30", icon: "◎", active: true },
    { id: 3, title: "Прогулка · 6,8 км", meta: "16 августа, 12:05", icon: "↗", active: true },
  ]);

  const days = checkedIn ? 17 : 16;
  const totalParticipants = 148;
  const totalDays = 1842 + (checkedIn ? 1 : 0);
  const streak = checkedIn ? 8 : 7;

  const title = useMemo(() => {
    if (tab === "progress") return "Мой август";
    if (tab === "community") return "Вместе";
    if (tab === "admin") return "Управление";
    return "Привет, Иван";
  }, [tab]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  function submitCheckin() {
    if (checkedIn) return;
    setCheckedIn(true);
    setActivities((items) => [
      { id: Date.now(), title: `${activity}${note ? ` · ${note}` : ""}`, meta: "Сегодня · подтверждено", icon: "✓", active: true },
      ...items,
    ]);
    setShowCheckin(false);
    showToast("Активность засчитана. Серия продолжается!");
  }

  function downloadCsv() {
    const rows = [
      ["Участник", "Активных дней", "Текущая серия", "Максимальная серия", "Статус"],
      ["Иван Петров", days, streak, 12, "В игре"],
      ["Лена К.", 18, 18, 18, "В игре"],
      ["Саша М.", 17, 12, 15, "В игре"],
      ["Ира П.", 15, 9, 9, "В игре"],
    ];
    const csv = "\uFEFF" + rows.map((row) => row.join(";")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = "avgust-v-dvizhenii.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Выгрузка готова");
  }

  return (
    <main className="app-shell">
      <section className="phone">
        <header className="topbar">
          <button className="brand" onClick={() => setTab("today")} aria-label="На главную">
            <span className="brand-mark">А</span>
            <span>АВГУСТ<br /><b>В ДВИЖЕНИИ</b></span>
          </button>
          <button className="avatar" onClick={() => setTab("progress")} aria-label="Открыть профиль">ИП</button>
        </header>

        <div className="page-heading">
          <p>{tab === "today" ? "18 августа · воскресенье" : tab === "admin" ? "Панель организатора" : "Август в движении"}</p>
          <h1>{title}</h1>
        </div>

        {tab === "today" && (
          <div className="view">
            <section className="hero-card">
              <div className="hero-top">
                <div>
                  <span className="eyebrow">{checkedIn ? "Сегодня готово" : "Серия продолжается"}</span>
                  <h2><strong>{streak}</strong> дней подряд</h2>
                </div>
                <div className="streak-orbit"><span>↗</span></div>
              </div>
              <div className="week-row">
                {week.map((item) => (
                  <div className={`day ${item.today ? "today" : ""} ${item.done || checkedIn && item.today ? "done" : ""}`} key={item.date}>
                    <span>{item.day}</span>
                    <b>{item.done || checkedIn && item.today ? "✓" : item.date}</b>
                  </div>
                ))}
              </div>
              <button className={`primary ${checkedIn ? "complete" : ""}`} onClick={() => !checkedIn && setShowCheckin(true)}>
                {checkedIn ? "✓ Активность уже засчитана" : "Отметить активность"}
              </button>
              <small>{checkedIn ? "Следующая отметка будет доступна завтра" : "Одна зачётная отметка в день"}</small>
            </section>

            <section className="section">
              <div className="section-title"><h3>Ваш прогресс</h3><button onClick={() => setTab("progress")}>Подробнее</button></div>
              <div className="stats-grid">
                <article><span>Активных дней</span><b>{days}<i>/31</i></b><div className="bar"><i style={{ width: `${days / 31 * 100}%` }} /></div></article>
                <article><span>До розыгрыша</span><b>{Math.max(0, 20 - days)}<i>дня</i></b><p>Нужно 20 активных дней</p></article>
              </div>
            </section>

            <section className="theme-card">
              <span className="theme-number">03</span>
              <div><span className="eyebrow">Тема недели</span><h3>Двигаемся вместе</h3><p>Попробуйте общую тренировку или позовите друга на прогулку.</p></div>
            </section>

            <section className="training-card">
              <div className="date-block"><b>21</b><span>АВГ</span></div>
              <div><span className="eyebrow">Общая тренировка</span><h3>Функциональная тренировка</h3><p>Среда · 19:00 · Парк Горького</p></div>
              <button onClick={() => showToast("Тренировка добавлена в планы")}>＋</button>
            </section>
          </div>
        )}

        {tab === "progress" && (
          <div className="view">
            <section className="progress-hero">
              <div className="ring" style={{ "--progress": `${days / 31 * 360}deg` } as React.CSSProperties}><div><b>{days}</b><span>из 31 дня</span></div></div>
              <div><span className="eyebrow">Вы в игре</span><h2>Отличный темп</h2><p>До участия в розыгрыше — {Math.max(0, 20 - days)} активных дня.</p></div>
            </section>
            <div className="triple-stats">
              <article><b>{streak}</b><span>текущая серия</span></article>
              <article><b>12</b><span>макс. серия</span></article>
              <article><b>3</b><span>достижения</span></article>
            </div>
            <section className="section">
              <div className="section-title"><h3>Достижения</h3><span>3 из 5</span></div>
              <div className="badges">
                {badges.map((badge) => <article className={badge.earned ? "" : "locked"} key={badge.title}><div>{badge.icon}</div><b>{badge.title}</b><span>{badge.note}</span></article>)}
              </div>
            </section>
            <section className="section">
              <div className="section-title"><h3>Последняя активность</h3><button onClick={() => setTab("today")}>Все дни</button></div>
              <div className="activity-list">
                {activities.slice(0, 3).map((item) => <article key={item.id}><span>{item.icon}</span><div><b>{item.title}</b><small>{item.meta}</small></div><i>✓</i></article>)}
              </div>
            </section>
          </div>
        )}

        {tab === "community" && (
          <div className="view">
            <section className="report-card">
              <span className="eyebrow">Итоги недели · 12–18 августа</span>
              <h2>Ещё одна неделя<br />в движении</h2>
              <div className="report-stats"><div><b>{totalParticipants}</b><span>остаются в игре</span></div><div><b>{totalDays.toLocaleString("ru")}</b><span>активных дней вместе</span></div></div>
              <div className="collective-goal"><span>Общая цель · 2 500 дней</span><b>74%</b><i><em style={{ width: "74%" }} /></i></div>
            </section>
            <section className="section">
              <div className="section-title"><h3>Участники</h3><span>Без мест — каждый в своём темпе</span></div>
              <div className="people-list">
                {people.map((person) => <article key={person.name}><span className="person-avatar" style={{ background: person.color }}>{person.name.slice(0, 1)}</span><div><b>{person.name}</b><small>{person.days} активных дней</small></div><span className="series">↗ {person.streak} дней</span></article>)}
              </div>
            </section>
            <section className="story-card">
              <div className="story-image" role="img" aria-label="Силуэт бегуна на фоне заката"><span>«</span></div>
              <div><span className="eyebrow">История недели</span><h3>«Я начала с десяти минут. Теперь не представляю утро без движения»</h3><p>Аня, участница проекта</p></div>
            </section>
          </div>
        )}

        {tab === "admin" && (
          <div className="view admin-view">
            <div className="admin-tabs">
              {["Все", "Спорные", "Отключены"].map((item) => <button className={adminFilter === item ? "active" : ""} onClick={() => setAdminFilter(item)} key={item}>{item}{item === "Спорные" && <i>3</i>}</button>)}
            </div>
            <section className="admin-summary">
              <article><span>В игре</span><b>148</b><small>из 156 регистраций</small></article>
              <article><span>Отметок сегодня</span><b>96</b><small>65% участников</small></article>
            </section>
            <section className="section">
              <div className="section-title"><h3>Требуют внимания</h3><button onClick={() => showToast("Все спорные активности открыты")}>Открыть все</button></div>
              <div className="review-list">
                <article><span className="person-avatar orange">МК</span><div><b>Мария К.</b><small>Велосипед · фото загружено</small></div><button onClick={(e) => { e.currentTarget.closest("article")?.remove(); showToast("Активность подтверждена"); }}>Подтвердить</button></article>
                <article><span className="person-avatar violet">АС</span><div><b>Андрей С.</b><small>Отметка за 17 августа</small></div><button onClick={(e) => { e.currentTarget.closest("article")?.remove(); showToast("Активность подтверждена"); }}>Подтвердить</button></article>
              </div>
            </section>
            <section className="section">
              <div className="section-title"><h3>Настройки проекта</h3></div>
              <div className="settings-list">
                <label><div><b>Вечернее напоминание</b><small>Ежедневно по Москве</small></div><input aria-label="Время напоминания" type="time" value={schedule} onChange={(e) => setSchedule(e.target.value)} /></label>
                <button onClick={() => showToast("Сообщение подготовлено к отправке")}><span>✉</span><div><b>Сообщение всем</b><small>148 получателей</small></div><i>›</i></button>
                <button onClick={downloadCsv}><span>⇩</span><div><b>Выгрузить статистику</b><small>Excel / CSV</small></div><i>›</i></button>
                <button onClick={() => showToast("Журнал действий открыт")}><span>≡</span><div><b>Журнал действий</b><small>Все ручные изменения</small></div><i>›</i></button>
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

      {showCheckin && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowCheckin(false)}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="checkin-title">
          <button className="modal-close" onClick={() => setShowCheckin(false)} aria-label="Закрыть">×</button>
          <span className="eyebrow">18 августа</span><h2 id="checkin-title">Что сегодня делали?</h2>
          <div className="activity-options">{["Бег", "Прогулка", "Йога", "Велосипед"].map((item) => <button className={activity === item ? "active" : ""} onClick={() => setActivity(item)} key={item}>{item}</button>)}</div>
          <label className="note-field">Коротко об активности<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: 5 км в парке" /></label>
          <button className="primary" onClick={submitCheckin}>Засчитать день</button>
        </section>
      </div>}
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}
