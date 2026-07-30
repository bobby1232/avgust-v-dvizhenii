"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ActivityDto,
  AchievementDto,
  AdminActivityDto,
  CompetitionDto,
  ParticipantDto,
  ProfileDto,
  ProgressDto,
} from "@/lib/dto";

type Tab = "today" | "progress" | "community" | "admin";
type AdminTab = "participants" | "activities" | "achievements" | "settings" | "tools";
type Me = {
  registered: boolean;
  role: "participant" | "admin";
  telegramUser: { firstName?: string; username?: string };
  profile: ProfileDto | null;
  competition: CompetitionDto;
  stats: Partial<ProgressDto>;
};
type Community = {
  registeredParticipants: number;
  activeParticipants: number;
  totalActiveDays: number;
  participants: ParticipantDto[];
};
type AdminStats = {
  totalRegistrations: number;
  activeParticipants: number;
  checkinsToday: number;
  totalActivities: number;
};
type ActivityResponse = { activities: ActivityDto[]; activityTypes: string[] };
type AchievementAdmin = {
  definitions: Array<AchievementDto & { isAutomatic: boolean }>;
  awards: Array<{ id: number; userId: number; participant: string; achievementId: number; revokedAt: string | null }>;
};

const emptyCommunity: Community = {
  registeredParticipants: 0,
  activeParticipants: 0,
  totalActiveDays: 0,
  participants: [],
};

class ClientError extends Error {
  constructor(message: string, public details: Record<string, string[]> = {}) {
    super(message);
  }
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  const body = await response.json();
  if (!response.ok) throw new ClientError(body.error || "Ошибка сервера", body.details);
  return body;
}

function telegramInitData(): string {
  const telegram = (window as typeof window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
  if (telegram?.initData) return telegram.initData;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hash.get("tgWebAppData") ?? "";
}

function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("ru-RU");
}

function statusLabel(status: ActivityDto["status"]) {
  return status === "approved" ? "Засчитана" : status === "pending" ? "На проверке" : "Отклонена";
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("today");
  const [adminTab, setAdminTab] = useState<AdminTab>("participants");
  const [me, setMe] = useState<Me | null>(null);
  const [progress, setProgress] = useState<ProgressDto | null>(null);
  const [activities, setActivities] = useState<ActivityDto[]>([]);
  const [activityTypes, setActivityTypes] = useState<string[]>([]);
  const [community, setCommunity] = useState<Community>(emptyCommunity);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [adminActivities, setAdminActivities] = useState<AdminActivityDto[]>([]);
  const [adminParticipants, setAdminParticipants] = useState<ParticipantDto[]>([]);
  const [achievementAdmin, setAchievementAdmin] = useState<AchievementAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [achievementToast, setAchievementToast] = useState<AchievementDto | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [activityType, setActivityType] = useState("");
  const [customActivityName, setCustomActivityName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [description, setDescription] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [participantSearch, setParticipantSearch] = useState("");
  const [achievementUserId, setAchievementUserId] = useState(0);
  const [achievementId, setAchievementId] = useState(0);
  const [adminComment, setAdminComment] = useState("");
  const [reminderTime, setReminderTime] = useState("20:00");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastAudience, setBroadcastAudience] = useState("all_active");
  const [broadcastMinimum, setBroadcastMinimum] = useState(20);
  const [broadcastPreview, setBroadcastPreview] = useState("");
  const [drawRunId, setDrawRunId] = useState("");
  const [drawResult, setDrawResult] = useState("");

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const loadRegisteredData = useCallback(async (role: Me["role"]) => {
    const [activityResponse, group, stats] = await Promise.all([
      api<ActivityResponse>("/api/activities"),
      api<Community>("/api/community"),
      api<ProgressDto>("/api/progress"),
    ]);
    setActivities(activityResponse.activities);
    setActivityTypes(activityResponse.activityTypes);
    setActivityType((current) => current || activityResponse.activityTypes[0] || "");
    setCommunity(group);
    setProgress(stats);
    if (role === "admin") {
      const [summary, userRows, activityRows, achievements] = await Promise.all([
        api<AdminStats>("/api/admin/stats"),
        api<{ users: ParticipantDto[] }>("/api/admin/users"),
        api<{ activities: AdminActivityDto[] }>("/api/admin/activities"),
        api<AchievementAdmin>("/api/admin/achievements"),
      ]);
      setAdminStats(summary);
      setAdminParticipants(userRows.users);
      setAdminActivities(activityRows.activities);
      setAchievementAdmin(achievements);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const telegram = (window as typeof window & {
        Telegram?: { WebApp?: { ready?: () => void; expand?: () => void } };
      }).Telegram?.WebApp;
      telegram?.ready?.();
      telegram?.expand?.();
      const initData = telegramInitData();
      if (!initData) throw new Error("Откройте приложение из кнопки Telegram-бота.");
      await api("/api/auth/telegram", { method: "POST", body: JSON.stringify({ initData }) });
      const current = await api<Me>("/api/me");
      setMe(current);
      setName((value) => value || current.telegramUser.firstName || "");
      if (current.registered) await loadRegisteredData(current.role);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить приложение");
    } finally {
      setLoading(false);
    }
  }, [loadRegisteredData]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function register() {
    try {
      await api("/api/register", {
        method: "POST",
        body: JSON.stringify({ displayName: name, department }),
      });
      notify("Регистрация завершена");
      await load();
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "Ошибка регистрации");
    }
  }

  async function checkin() {
    setFieldErrors({});
    try {
      const result = await api<{
        dailyCount: number;
        awardedAchievements: AchievementDto[];
      }>("/api/activities", {
        method: "POST",
        body: JSON.stringify({
          activityType,
          customActivityName,
          durationMinutes,
          description,
        }),
      });
      setShowCheckin(false);
      setCustomActivityName("");
      setDurationMinutes(20);
      setDescription("");
      notify(result.dailyCount > 1 ? "Активность сохранена. День уже был засчитан." : "Активность сохранена. День засчитан.");
      if (result.awardedAchievements[0]) setAchievementToast(result.awardedAchievements[0]);
      if (me) await loadRegisteredData(me.role);
    } catch (caught) {
      if (caught instanceof ClientError) setFieldErrors(caught.details);
      notify(caught instanceof Error ? caught.message : "Ошибка сохранения");
    }
  }

  async function updateParticipant(participant: ParticipantDto, changes: Record<string, unknown>) {
    try {
      await api("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ id: participant.id, ...changes, comment: "Изменение через административный интерфейс" }),
      });
      notify("Профиль обновлён");
      if (me) await loadRegisteredData(me.role);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "Ошибка обновления");
    }
  }

  async function moderateActivity(item: AdminActivityDto, status: ActivityDto["status"]) {
    try {
      await api("/api/admin/activities", {
        method: "PATCH",
        body: JSON.stringify({
          id: item.activity.id,
          status,
          comment: `Статус изменён на ${status}`,
        }),
      });
      notify("Статус активности обновлён");
      if (me) await loadRegisteredData(me.role);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "Ошибка модерации");
    }
  }

  async function removeActivity(item: AdminActivityDto) {
    if (!window.confirm("Удалить активность? Прогресс будет пересчитан.")) return;
    try {
      await api("/api/admin/activities", {
        method: "DELETE",
        body: JSON.stringify({ id: item.activity.id, comment: "Удаление через административный интерфейс" }),
      });
      notify("Активность удалена");
      if (me) await loadRegisteredData(me.role);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "Ошибка удаления");
    }
  }

  async function editActivity(item: AdminActivityDto) {
    const duration = window.prompt("Продолжительность, минут", String(item.activity.durationMinutes));
    if (duration === null) return;
    const note = window.prompt("Описание (можно очистить)", item.activity.description ?? "");
    if (note === null) return;
    try {
      await api("/api/admin/activities", {
        method: "PATCH",
        body: JSON.stringify({
          id: item.activity.id,
          durationMinutes: Number(duration),
          description: note,
          comment: "Редактирование через административный интерфейс",
        }),
      });
      notify("Активность изменена");
      if (me) await loadRegisteredData(me.role);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "Ошибка редактирования");
    }
  }

  async function changeAchievement(action: "award" | "revoke") {
    try {
      await api("/api/admin/achievements", {
        method: "POST",
        body: JSON.stringify({ userId: achievementUserId, achievementId, action, comment: adminComment }),
      });
      notify(action === "award" ? "Достижение присвоено" : "Достижение отозвано");
      setAdminComment("");
      if (me) await loadRegisteredData(me.role);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "Ошибка изменения достижения");
    }
  }

  async function saveSettings() {
    try {
      await api("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          reminderTime,
          comment: adminComment || "Изменение настроек через интерфейс",
        }),
      });
      notify("Настройки сохранены");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "Ошибка настроек");
    }
  }

  async function previewBroadcast(send = false) {
    if (send && !window.confirm("Отправить сообщение выбранной аудитории?")) return;
    try {
      const result = await api<{ count?: number; recipients?: number; sent?: number; failed?: number }>("/api/admin/broadcasts", {
        method: "POST",
        body: JSON.stringify({
          audience: broadcastAudience,
          minimumActiveDays: broadcastAudience === "minimum_active_days" ? broadcastMinimum : undefined,
          message: broadcastMessage,
          preview: !send,
          comment: adminComment || "Рассылка через административный интерфейс",
        }),
      });
      setBroadcastPreview(send
        ? `Отправлено: ${result.sent ?? 0}, ошибок: ${result.failed ?? 0}`
        : `Получателей: ${result.count ?? 0}`);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "Ошибка рассылки");
    }
  }

  async function runDraw() {
    try {
      const result = await api<{ winners: Array<{ position: number; displayName: string }> }>("/api/admin/draw", {
        method: "POST",
        body: JSON.stringify({
          runId: drawRunId,
          winnersCount: 1,
          excludePreviousWinners: false,
          comment: adminComment || "Розыгрыш через административный интерфейс",
        }),
      });
      setDrawResult(result.winners.map((winner) => `${winner.position}. ${winner.displayName}`).join(", "));
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "Ошибка розыгрыша");
    }
  }

  async function shareFinalCard() {
    const text = `${user?.displayName} прошёл август в игре\n${days} активных дней\nМаксимальная серия — ${stats?.maxStreak ?? 0} дней\n${stats?.achievementCount ?? 0} достижений\nЛюбимая активность — ${stats?.favoriteActivity ?? "не определена"}`;
    if (navigator.share) await navigator.share({ title: "GOSUP GAMES", text });
    else {
      await navigator.clipboard.writeText(text);
      notify("Итоговая карточка скопирована");
    }
  }

  const user = me?.profile;
  const stats = progress ?? me?.stats;
  const days = stats?.activeDays ?? 0;
  const streak = stats?.currentStreak ?? stats?.current ?? 0;
  const checked = stats?.checkedInToday ?? false;
  const initials = user?.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
  const filteredParticipants = useMemo(() => adminParticipants.filter((participant) =>
    `${participant.displayName} ${participant.department ?? ""}`.toLowerCase().includes(participantSearch.toLowerCase())),
  [adminParticipants, participantSearch]);

  if (loading) return <main className="app-shell"><section className="phone"><div className="page-heading"><p>GOSUP GAMES</p><h1>Загрузка…</h1></div></section></main>;
  if (error) return <main className="app-shell"><section className="phone"><div className="page-heading"><p>Не удалось открыть приложение</p><h1>{error}</h1><button className="primary" onClick={() => void load()}>Повторить</button></div></section></main>;

  return <main className="app-shell">
    <section className="phone">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("today")}><span className="brand-mark">G</span><span>GOSUP GAMES<br/><b>31 ДЕНЬ В ИГРЕ</b></span></button>
        <button className="avatar" onClick={() => setTab("progress")}>{initials}</button>
      </header>
      <div className="page-heading">
        <p>{me?.competition.name} · Europe/Moscow</p>
        <h1>{tab === "today" ? `Привет, ${user?.displayName.split(" ")[0] ?? "участник"}` : tab === "progress" ? "Мой прогресс" : tab === "community" ? "Двигаемся вместе" : "Управление"}</h1>
      </div>

      {tab === "today" && <div className="view">
        <section className="hero-card">
          <div className="hero-top"><div><span className="eyebrow">{checked ? "Сегодня готово" : "Не останавливаемся"}</span><h2><strong>{streak}</strong> дней подряд</h2></div><div className="streak-orbit"><span>↗</span></div></div>
          <button className={`primary ${checked ? "complete" : ""}`} onClick={() => setShowCheckin(true)}>{checked ? "＋ Добавить ещё активность" : "Отметить активность"}</button>
          <small>Несколько тренировок сохраняются отдельно, день засчитывается один раз</small>
        </section>
        <section className="section"><div className="stats-grid">
          <article><span>Активных дней</span><b>{days}<i>/31</i></b><div className="bar"><i style={{ width: `${Math.min(100, days / 31 * 100)}%` }}/></div></article>
          <article><span>До розыгрыша</span><b>{stats?.remainingToDraw ?? Math.max(0, 20 - days)}<i>дней</i></b><p>Допуск с 20 активных дней</p></article>
        </div></section>
        <section className="section"><button className="text-button" onClick={() => setShowRules(true)}>Открыть полные правила</button></section>
      </div>}

      {tab === "progress" && <div className="view">
        <section className="progress-hero"><div className="ring" style={{ "--progress": `${Math.min(360, days / 31 * 360)}deg` } as React.CSSProperties}><div><b>{days}</b><span>из 31 дня</span></div></div><div><span className="eyebrow">Ваш результат</span><h2>{user?.displayName}</h2><p>{user?.department || "Подразделение не указано"}</p></div></section>
        <section className="section"><div className="stats-grid">
          <article><span>Максимальная серия</span><b>{stats?.maxStreak ?? stats?.max ?? 0}<i>дней</i></b></article>
          <article><span>Пропущено</span><b>{stats?.missedDays ?? 0}<i>дней</i></b></article>
          <article><span>Достижения</span><b>{stats?.achievementCount ?? 0}</b></article>
          <article><span>Всего тренировок</span><b>{stats?.totalDurationMinutes ?? 0}<i>мин</i></b></article>
        </div></section>
        <section className="section"><div className="section-title"><h3>Достижения</h3></div><div className="badge-list">{stats?.achievements?.map((achievement) => <article key={achievement.id}><span>{achievement.emoji}</span><div><b>{achievement.name}</b><small>{achievement.description}</small></div></article>) || <p>Пока нет достижений</p>}</div></section>
        <section className="section"><div className="section-title"><h3>История активностей</h3><span>Любимая: {stats?.favoriteActivity ?? "—"}</span></div><div className="activity-list">{activities.map((item) => <article key={item.id}><span className={`status-dot ${item.status}`}>●</span><div><b>{item.activityType}{item.customActivityName ? ` — ${item.customActivityName}` : ""} · {item.durationMinutes} мин</b><small>{formatDate(item.activityDate)} · {statusLabel(item.status)}{item.description ? ` · ${item.description}` : ""}</small></div></article>)}</div></section>
        {me?.competition.endDate && new Date() > new Date(`${me.competition.endDate}T20:59:59Z`) && <section className="section"><div className="final-card"><h3>{user?.displayName} прошёл август в игре</h3><p>{days} активных дней<br/>Максимальная серия — {stats?.maxStreak ?? 0} дней<br/>{stats?.achievementCount ?? 0} достижений<br/>Любимая активность — {stats?.favoriteActivity ?? "не определена"}</p><button className="primary" onClick={() => void shareFinalCard()}>Сохранить или отправить</button></div></section>}
      </div>}

      {tab === "community" && <div className="view">
        <section className="report-card"><span className="eyebrow">Без мест и спортивных баллов</span><h2>Двигаемся<br/>вместе</h2><div className="report-stats"><div><b>{community.registeredParticipants}</b><span>участников</span></div><div><b>{community.totalActiveDays}</b><span>активных дней вместе</span></div></div></section>
        <section className="section"><div className="people-list">{community.participants.map((participant) => <article key={participant.id}><span className="person-avatar">{participant.displayName[0]}</span><div><b>{participant.displayName}</b><small>{participant.department || "Без подразделения"} · {participant.activeDays} дней</small></div><span className="series">↗ {participant.currentStreak}</span></article>)}</div></section>
      </div>}

      {tab === "admin" && me?.role === "admin" && <div className="view admin-view">
        <section className="admin-summary"><article><span>Регистраций</span><b>{adminStats?.totalRegistrations ?? 0}</b><small>Активных: {adminStats?.activeParticipants ?? 0}</small></article><article><span>Зачтено сегодня</span><b>{adminStats?.checkinsToday ?? 0}</b><small>Записей: {adminStats?.totalActivities ?? 0}</small></article></section>
        <section className="section"><div className="admin-tabs">{(["participants", "activities", "achievements", "settings", "tools"] as AdminTab[]).map((value) => <button key={value} className={adminTab === value ? "active" : ""} onClick={() => setAdminTab(value)}>{value === "participants" ? "Участники" : value === "activities" ? "Активности" : value === "achievements" ? "Достижения" : value === "settings" ? "Настройки" : "Инструменты"}</button>)}</div></section>
        {adminTab === "participants" && <section className="section"><label className="note-field">Поиск<input value={participantSearch} onChange={(event) => setParticipantSearch(event.target.value)} placeholder="Имя или подразделение"/></label><div className="people-list">{filteredParticipants.map((participant) => <article key={participant.id}><span className="person-avatar">{participant.displayName[0]}</span><div><b>{participant.displayName}</b><small>{participant.activeDays} дней · {participant.isActive ? "активен" : "отключён"} · уведомления {participant.notificationsEnabled ? "вкл." : "выкл."}</small></div><div className="row-actions"><button onClick={() => void updateParticipant(participant, { isActive: !participant.isActive })}>{participant.isActive ? "Отключить" : "Включить"}</button><button onClick={() => void updateParticipant(participant, { notificationsEnabled: !participant.notificationsEnabled })}>Увед.</button></div></article>)}</div></section>}
        {adminTab === "activities" && <section className="section"><div className="activity-list">{adminActivities.map((item) => <article key={item.activity.id}><span className={`status-dot ${item.activity.status}`}>●</span><div><b>{item.participant} · {item.activity.activityType}</b><small>{item.activity.activityDate} · {item.activity.durationMinutes} мин · {statusLabel(item.activity.status)}</small><div className="row-actions"><button onClick={() => void editActivity(item)}>Изменить</button><button onClick={() => void moderateActivity(item, "approved")}>Подтвердить</button><button onClick={() => void moderateActivity(item, "rejected")}>Отклонить</button><button onClick={() => void removeActivity(item)}>Удалить</button></div></div></article>)}</div></section>}
        {adminTab === "achievements" && <section className="section"><div className="admin-form"><label className="note-field">Участник<select value={achievementUserId} onChange={(event) => setAchievementUserId(Number(event.target.value))}><option value={0}>Выберите</option>{adminParticipants.map((participant) => <option key={participant.id} value={participant.id}>{participant.displayName}</option>)}</select></label><label className="note-field">Достижение<select value={achievementId} onChange={(event) => setAchievementId(Number(event.target.value))}><option value={0}>Выберите</option>{achievementAdmin?.definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.emoji} {definition.name}</option>)}</select></label><label className="note-field">Комментарий<input value={adminComment} onChange={(event) => setAdminComment(event.target.value)}/></label><div className="row-actions"><button onClick={() => void changeAchievement("award")}>Присвоить</button><button onClick={() => void changeAchievement("revoke")}>Отозвать</button></div></div><div className="badge-list">{achievementAdmin?.definitions.map((definition) => <article key={definition.id}><span>{definition.emoji}</span><div><b>{definition.name}</b><small>{definition.description} · {definition.isAutomatic ? "автоматическое" : "ручное"}</small></div></article>)}</div></section>}
        {adminTab === "settings" && <section className="section"><div className="admin-form"><label className="note-field">Время напоминания<input type="time" value={reminderTime} onChange={(event) => setReminderTime(event.target.value)}/></label><label className="note-field">Комментарий<input value={adminComment} onChange={(event) => setAdminComment(event.target.value)}/></label><button className="primary" onClick={() => void saveSettings()}>Сохранить настройки</button></div><div className="settings-list"><a href="/api/admin/export?format=csv"><span>⇩</span><div><b>Скачать CSV</b><small>Participants, Activities, Achievements, Audit</small></div><i>›</i></a></div></section>}
        {adminTab === "tools" && <section className="section"><div className="admin-form"><h3>Рассылка</h3><label className="note-field">Аудитория<select value={broadcastAudience} onChange={(event) => setBroadcastAudience(event.target.value)}><option value="all_active">Все активные</option><option value="without_today">Без активности сегодня</option><option value="minimum_active_days">С минимумом активных дней</option></select></label>{broadcastAudience === "minimum_active_days" && <label className="note-field">Минимум дней<input type="number" min={0} max={31} value={broadcastMinimum} onChange={(event) => setBroadcastMinimum(Number(event.target.value))}/></label>}<label className="note-field">Сообщение<input value={broadcastMessage} onChange={(event) => setBroadcastMessage(event.target.value)}/></label><div className="row-actions"><button onClick={() => void previewBroadcast(false)}>Preview</button><button onClick={() => void previewBroadcast(true)}>Подтвердить отправку</button></div><small>{broadcastPreview}</small><h3>Розыгрыш</h3><label className="note-field">Run ID<input value={drawRunId} onChange={(event) => setDrawRunId(event.target.value)} placeholder="Например august-2026-final"/></label><button className="primary" onClick={() => void runDraw()}>Провести розыгрыш</button><small>{drawResult}</small></div></section>}
      </div>}

      <nav className="bottom-nav"><button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}><span>⌂</span>Сегодня</button><button className={tab === "progress" ? "active" : ""} onClick={() => setTab("progress")}><span>◴</span>Прогресс</button><button className={tab === "community" ? "active" : ""} onClick={() => setTab("community")}><span>◌</span>Вместе</button>{me?.role === "admin" && <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}><span>⌘</span>Админ</button>}</nav>
    </section>

    {!me?.registered && <div className="modal-backdrop"><section className="modal"><span className="eyebrow">GOSUP GAMES | 31 день в игре</span><h2>Движение каждый день</h2><p>С 1 по 31 августа отмечайте осознанную физическую активность длительностью от 20 минут.</p><button className="text-button" onClick={() => setShowRules(true)}>Прочитать полные правила</button><label className="note-field">Отображаемое имя<input maxLength={120} value={name} onChange={(event) => setName(event.target.value)}/></label><label className="note-field">Подразделение<input maxLength={120} value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Необязательно"/></label><button className="primary" onClick={() => void register()}>Вступить в игру</button></section></div>}

    {showCheckin && <div className="modal-backdrop"><section className="modal"><button className="modal-close" onClick={() => setShowCheckin(false)}>×</button><span className="eyebrow">Активность дня</span><h2>Что сегодня делали?</h2><label className="note-field">Вид активности<select value={activityType} onChange={(event) => setActivityType(event.target.value)}>{activityTypes.map((type) => <option key={type}>{type}</option>)}</select></label>{activityType === "Другое" && <label className="note-field">Название активности<input maxLength={120} value={customActivityName} onChange={(event) => setCustomActivityName(event.target.value)}/><small>{fieldErrors.customActivityName?.[0]}</small></label>}<label className="note-field">Продолжительность, минут<input type="number" min={20} max={1440} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}/><small>{fieldErrors.durationMinutes?.[0]}</small></label><label className="note-field">Описание<input maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Необязательно"/></label><button className="primary" onClick={() => void checkin()}>Сохранить активность</button></section></div>}

    {showRules && <div className="modal-backdrop"><section className="modal rules-modal"><button className="modal-close" onClick={() => setShowRules(false)}>×</button><span className="eyebrow">Правила</span><h2>31 день в игре</h2><p>Игровой день: 00:00–23:59 по Москве. Подходит любая выделенная физическая активность от 20 минут. Несколько тренировок можно сохранить, но календарный день и серия увеличиваются максимум на один. Пропуск обнуляет текущую серию, но не исключает из игры. 20 активных дней дают допуск к розыгрышу. Спортивные результаты участников не сравниваются.</p><b>Не важно, что ты делаешь. Важно — не останавливаться.</b></section></div>}
    {achievementToast && <div className="modal-backdrop"><section className="modal achievement-modal"><span className="achievement-emoji">{achievementToast.emoji}</span><h2>{achievementToast.name}</h2><p>{achievementToast.description}</p><button className="primary" onClick={() => setAchievementToast(null)}>Продолжить</button></section></div>}
    {toast && <div className="toast">{toast}</div>}
  </main>;
}
