"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type AdminSettingsResponse = { settings: null | {
  reminderTime: string; groupFeedEnabled: boolean; activityDigestEnabled: boolean;
  publishEachActivityEnabled: boolean; activityDigestIntervalMinutes: number;
  achievementAnnouncementsEnabled: boolean; leaderboardAnnouncementsEnabled: boolean;
  leaderboardDayTime: string; leaderboardEveningTime: string;
  dailySummaryEnabled: boolean; dailySummaryTime: string;
} };

const fallbackActivityTypes = [
  "Бег", "Ходьба", "SUP", "Велосипед", "Плавание", "Тренировка в зале",
  "Турник / воркаут", "Йога", "Растяжка", "Футбол", "Командная игра",
  "Семейная тренировка", "Тренировка с другом", "Другое",
];

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
  const query = new URLSearchParams(window.location.search.replace(/^\?/, ""));
  return hash.get("tgWebAppData") || query.get("tgWebAppData") || "";
}

function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("ru-RU");
}

function statusLabel(status: ActivityDto["status"]) {
  return status === "approved" ? "Засчитана" : status === "pending" ? "На проверке" : "Отклонена";
}

function achievementCardSrc(code: string): string {
  return `/achievements/${encodeURIComponent(code)}.jpg`;
}

function logBackgroundFailure(name: string, reason: unknown): void {
  console.error(`[startup:${name}]`, reason instanceof Error ? reason.message : reason);
}

const avatarStorageKey = "gosup-games-avatar";

function prepareAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать фотографию"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Выберите изображение JPG, PNG или WEBP"));
      image.onload = () => {
        const size = Math.min(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 320;
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("Не удалось обработать фотографию"));
        context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 320, 320);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function prepareActivityPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать фотографию"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Выберите изображение JPG, PNG или WEBP"));
      image.onload = () => {
        const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("Не удалось обработать фотографию"));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("today");
  const [adminTab, setAdminTab] = useState<AdminTab>("participants");
  const [me, setMe] = useState<Me | null>(null);
  const [progress, setProgress] = useState<ProgressDto | null>(null);
  const [activities, setActivities] = useState<ActivityDto[]>([]);
  const [activityTypes, setActivityTypes] = useState<string[]>(fallbackActivityTypes);
  const [community, setCommunity] = useState<Community>(emptyCommunity);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [adminActivities, setAdminActivities] = useState<AdminActivityDto[]>([]);
  const [adminParticipants, setAdminParticipants] = useState<ParticipantDto[]>([]);
  const [achievementAdmin, setAchievementAdmin] = useState<AchievementAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [achievementQueue, setAchievementQueue] = useState<AchievementDto[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [showCheckin, setShowCheckin] = useState(false);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [activityType, setActivityType] = useState(fallbackActivityTypes[0]);
  const [customActivityName, setCustomActivityName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("20");
  const [description, setDescription] = useState("");
  const [evidencePhotos, setEvidencePhotos] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [participantSearch, setParticipantSearch] = useState("");
  const [achievementUserId, setAchievementUserId] = useState(0);
  const [achievementId, setAchievementId] = useState(0);
  const [adminComment, setAdminComment] = useState("");
  const [reminderTime, setReminderTime] = useState("20:00");
  const [groupFeedEnabled, setGroupFeedEnabled] = useState(true);
  const [activityDigestEnabled, setActivityDigestEnabled] = useState(true);
  const [publishEachActivityEnabled, setPublishEachActivityEnabled] = useState(false);
  const [digestInterval, setDigestInterval] = useState(10);
  const [achievementAnnouncementsEnabled, setAchievementAnnouncementsEnabled] = useState(true);
  const [leaderboardAnnouncementsEnabled, setLeaderboardAnnouncementsEnabled] = useState(true);
  const [leaderboardDayTime, setLeaderboardDayTime] = useState("12:00");
  const [leaderboardEveningTime, setLeaderboardEveningTime] = useState("20:30");
  const [dailySummaryEnabled, setDailySummaryEnabled] = useState(true);
  const [dailySummaryTime, setDailySummaryTime] = useState("21:30");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastAudience, setBroadcastAudience] = useState("all_active");
  const [broadcastMinimum, setBroadcastMinimum] = useState(20);
  const [broadcastPreview, setBroadcastPreview] = useState("");
  const [drawRunId, setDrawRunId] = useState("");
  const [drawResult, setDrawResult] = useState("");
  const [avatarPhoto, setAvatarPhoto] = useState("");
  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const achievementToast = achievementQueue[0] ?? null;

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const loadRegisteredData = useCallback(async (role: Me["role"]) => {
    const [activityResult, communityResult, progressResult] = await Promise.allSettled([
      api<ActivityResponse>("/api/activities"),
      api<Community>("/api/community"),
      api<ProgressDto>("/api/progress"),
    ]);

    if (activityResult.status === "fulfilled") {
      setActivities(activityResult.value.activities);
      const types = activityResult.value.activityTypes.length
        ? activityResult.value.activityTypes
        : fallbackActivityTypes;
      setActivityTypes(types);
      setActivityType((current) => current || types[0] || fallbackActivityTypes[0]);
    } else {
      logBackgroundFailure("activities", activityResult.reason);
    }

    if (communityResult.status === "fulfilled") setCommunity(communityResult.value);
    else logBackgroundFailure("community", communityResult.reason);

    if (progressResult.status === "fulfilled") setProgress(progressResult.value);
    else logBackgroundFailure("progress", progressResult.reason);

    if (role !== "admin") return;

    const [summaryResult, usersResult, activitiesResult, achievementsResult, settingsResult] = await Promise.allSettled([
      api<AdminStats>("/api/admin/stats"),
      api<{ users: ParticipantDto[] }>("/api/admin/users"),
      api<{ activities: AdminActivityDto[] }>("/api/admin/activities"),
      api<AchievementAdmin>("/api/admin/achievements"),
      api<AdminSettingsResponse>("/api/admin/settings"),
    ]);

    if (summaryResult.status === "fulfilled") setAdminStats(summaryResult.value);
    else logBackgroundFailure("admin-stats", summaryResult.reason);
    if (usersResult.status === "fulfilled") setAdminParticipants(usersResult.value.users);
    else logBackgroundFailure("admin-users", usersResult.reason);
    if (activitiesResult.status === "fulfilled") setAdminActivities(activitiesResult.value.activities);
    else logBackgroundFailure("admin-activities", activitiesResult.reason);
    if (achievementsResult.status === "fulfilled") setAchievementAdmin(achievementsResult.value);
    else logBackgroundFailure("admin-achievements", achievementsResult.reason);
    if (settingsResult.status === "fulfilled" && settingsResult.value.settings) {
      const settings = settingsResult.value.settings;
      setReminderTime(settings.reminderTime.slice(0, 5));
      setGroupFeedEnabled(settings.groupFeedEnabled);
      setActivityDigestEnabled(settings.activityDigestEnabled);
      setPublishEachActivityEnabled(settings.publishEachActivityEnabled);
      setDigestInterval(settings.activityDigestIntervalMinutes);
      setAchievementAnnouncementsEnabled(settings.achievementAnnouncementsEnabled);
      setLeaderboardAnnouncementsEnabled(settings.leaderboardAnnouncementsEnabled);
      setLeaderboardDayTime(settings.leaderboardDayTime.slice(0, 5));
      setLeaderboardEveningTime(settings.leaderboardEveningTime.slice(0, 5));
      setDailySummaryEnabled(settings.dailySummaryEnabled);
      setDailySummaryTime(settings.dailySummaryTime.slice(0, 5));
    } else if (settingsResult.status === "rejected") logBackgroundFailure("admin-settings", settingsResult.reason);
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

      // Only Telegram auth and /api/me are critical for first paint. The working
      // ZIP opened at this point; expanded datasets must not block mobile startup.
      setLoading(false);
      if (current.registered) {
        void loadRegisteredData(current.role).catch((caught) => logBackgroundFailure("registered-data", caught));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить приложение");
      setLoading(false);
    }
  }, [loadRegisteredData]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    setAvatarPhoto(window.localStorage.getItem(avatarStorageKey) || "");
  }, []);

  async function selectAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
      notify("Выберите изображение размером до 10 МБ");
      return;
    }
    try {
      const prepared = await prepareAvatar(file);
      window.localStorage.setItem(avatarStorageKey, prepared);
      setAvatarPhoto(prepared);
      setShowAvatarEditor(false);
      notify("Фотография профиля обновлена");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "Не удалось загрузить фотографию");
    }
  }

  function removeAvatar() {
    window.localStorage.removeItem(avatarStorageKey);
    setAvatarPhoto("");
    setShowAvatarEditor(false);
    notify("Фотография удалена");
  }

  function dismissAchievementToast() {
    setAchievementQueue((queue) => queue.slice(1));
  }

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
          durationMinutes: Number(durationMinutes),
          description,
          evidencePhotos,
        }),
      });
      setShowCheckin(false);
      setCustomActivityName("");
      setDurationMinutes("20");
      setDescription("");
      setEvidencePhotos([]);
      notify(result.dailyCount > 1 ? "Активность сохранена. День уже был засчитан." : "Активность сохранена. День засчитан.");
      if (result.awardedAchievements.length) {
        setAchievementQueue((queue) => [...queue, ...result.awardedAchievements]);
      }
      if (me) await loadRegisteredData(me.role);
    } catch (caught) {
      if (caught instanceof ClientError) setFieldErrors(caught.details);
      notify(caught instanceof Error ? caught.message : "Ошибка сохранения");
    }
  }

  async function selectEvidencePhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    if (files.length > 2 || files.some(file => !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024)) {
      notify("Выберите одно или два изображения до 10 МБ каждое");
      return;
    }
    try { setEvidencePhotos(await Promise.all(files.map(prepareActivityPhoto))); }
    catch (caught) { notify(caught instanceof Error ? caught.message : "Не удалось обработать фотографии"); }
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
          groupFeedEnabled, activityDigestEnabled, publishEachActivityEnabled, activityDigestIntervalMinutes: digestInterval,
          achievementAnnouncementsEnabled, leaderboardAnnouncementsEnabled,
          leaderboardDayTime, leaderboardEveningTime, dailySummaryEnabled, dailySummaryTime,
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
        <button className="avatar" onClick={() => setShowAvatarEditor(true)} aria-label="Изменить фотографию профиля">
          {avatarPhoto ? <img src={avatarPhoto} alt="Фотография профиля"/> : initials}
          <span className="avatar-edit" aria-hidden="true">＋</span>
        </button>
      </header>
      <div className="page-heading">
        <p>{me?.competition.name} · Europe/Moscow</p>
        <h1>{tab === "today" ? `Привет, ${user?.displayName.split(" ")[0] ?? "участник"}` : tab === "progress" ? "Мой прогресс" : tab === "community" ? "Двигаемся вместе" : "Управление"}</h1>
      </div>

      {tab === "today" && <div className="view">
        <section className="hero-card">
          <div className="hero-top"><div><span className="eyebrow">{checked ? "Сегодня готово" : "Не останавливаемся"}</span><h2><strong>{streak}</strong> дней подряд</h2></div><div className="streak-orbit" aria-label={`${streak} дней подряд`}><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.6 2.4c.5 3.5-1.9 4.8-3.6 7.1-1.4 1.8-1.2 3.7.1 5.1-.1-2.2 1.2-3.6 2.7-4.8.1 2 1.7 3 2.2 4.6.4 1.3 0 2.6-.8 3.5 2.3-.8 3.8-3 3.8-5.6 0-3.6-2.2-7.2-4.4-9.9ZM10.9 21c-2.8-.4-5-2.8-5-5.8 0-2.2 1.1-4.1 2.8-5.4-.5 3.1.6 4.5 1.8 5.8 1.1 1.2 1.6 2.6.4 5.4Z"/></svg></span></div></div>
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
        <section className="section"><div className="section-title"><h3>Достижения</h3></div><div className="badge-list">{stats?.achievements?.length ? stats.achievements.map((achievement) => <article key={achievement.id}><span className="achievement-card-thumb"><img src={achievementCardSrc(achievement.code)} alt={`Карточка достижения «${achievement.name}»`} loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }}/><i aria-hidden="true">{achievement.emoji}</i></span><div><b>{achievement.name}</b><small>{achievement.description}</small></div></article>) : <p>Пока нет достижений</p>}</div></section>
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
        {adminTab === "achievements" && <section className="section"><div className="admin-form"><label className="note-field">Участник<select value={achievementUserId} onChange={(event) => setAchievementUserId(Number(event.target.value))}><option value={0}>Выберите</option>{adminParticipants.map((participant) => <option key={participant.id} value={participant.id}>{participant.displayName}</option>)}</select></label><label className="note-field">Достижение<select value={achievementId} onChange={(event) => setAchievementId(Number(event.target.value))}><option value={0}>Выберите</option>{achievementAdmin?.definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.emoji} {definition.name}</option>)}</select></label><label className="note-field">Комментарий<input value={adminComment} onChange={(event) => setAdminComment(event.target.value)}/></label><div className="row-actions"><button onClick={() => void changeAchievement("award")}>Присвоить</button><button onClick={() => void changeAchievement("revoke")}>Отозвать</button></div></div><div className="badge-list">{achievementAdmin?.definitions.map((definition) => <article key={definition.id}><span className="achievement-card-thumb"><img src={achievementCardSrc(definition.code)} alt={`Карточка достижения «${definition.name}»`} loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }}/><i aria-hidden="true">{definition.emoji}</i></span><div><b>{definition.name}</b><small>{definition.description} · {definition.isAutomatic ? "автоматическое" : "ручное"}</small></div></article>)}</div></section>}
        {adminTab === "settings" && <section className="section"><div className="admin-form"><label className="note-field">Время напоминания<input type="time" value={reminderTime} onChange={(event) => setReminderTime(event.target.value)}/></label><h3>Групповая лента</h3><label><input type="checkbox" checked={groupFeedEnabled} onChange={e => setGroupFeedEnabled(e.target.checked)}/> Лента включена</label><label><input type="checkbox" checked={activityDigestEnabled} onChange={e => setActivityDigestEnabled(e.target.checked)}/> Дайджест активностей</label><label><input type="checkbox" checked={publishEachActivityEnabled} onChange={e => setPublishEachActivityEnabled(e.target.checked)}/> Публиковать каждую активность с фото</label><label className="note-field">Интервал, минут<input type="number" min={1} max={120} value={digestInterval} onChange={e => setDigestInterval(Number(e.target.value))}/></label><label><input type="checkbox" checked={achievementAnnouncementsEnabled} onChange={e => setAchievementAnnouncementsEnabled(e.target.checked)}/> Новые бейджи</label><label><input type="checkbox" checked={leaderboardAnnouncementsEnabled} onChange={e => setLeaderboardAnnouncementsEnabled(e.target.checked)}/> Лидерборд</label><label className="note-field">Дневной лидерборд<input type="time" value={leaderboardDayTime} onChange={e => setLeaderboardDayTime(e.target.value)}/></label><label className="note-field">Вечерний лидерборд<input type="time" value={leaderboardEveningTime} onChange={e => setLeaderboardEveningTime(e.target.value)}/></label><label><input type="checkbox" checked={dailySummaryEnabled} onChange={e => setDailySummaryEnabled(e.target.checked)}/> Итоги дня</label><label className="note-field">Время итогов<input type="time" value={dailySummaryTime} onChange={e => setDailySummaryTime(e.target.value)}/></label><label className="note-field">Комментарий<input value={adminComment} onChange={(event) => setAdminComment(event.target.value)}/></label><button className="primary" onClick={() => void saveSettings()}>Сохранить настройки</button></div><div className="settings-list"><a href="/api/admin/export?format=csv"><span>⇩</span><div><b>Скачать CSV</b><small>Participants, Activities, Achievements, Audit</small></div><i>›</i></a></div></section>}
        {adminTab === "tools" && <section className="section"><div className="admin-form"><h3>Рассылка</h3><label className="note-field">Аудитория<select value={broadcastAudience} onChange={(event) => setBroadcastAudience(event.target.value)}><option value="all_active">Все активные</option><option value="without_today">Без активности сегодня</option><option value="minimum_active_days">С минимумом активных дней</option></select></label>{broadcastAudience === "minimum_active_days" && <label className="note-field">Минимум дней<input type="number" min={0} max={31} value={broadcastMinimum} onChange={(event) => setBroadcastMinimum(Number(event.target.value))}/></label>}<label className="note-field">Сообщение<input value={broadcastMessage} onChange={(event) => setBroadcastMessage(event.target.value)}/></label><div className="row-actions"><button onClick={() => void previewBroadcast(false)}>Preview</button><button onClick={() => void previewBroadcast(true)}>Подтвердить отправку</button></div><small>{broadcastPreview}</small><h3>Розыгрыш</h3><label className="note-field">Run ID<input value={drawRunId} onChange={(event) => setDrawRunId(event.target.value)} placeholder="Например august-2026-final"/></label><button className="primary" onClick={() => void runDraw()}>Провести розыгрыш</button><small>{drawResult}</small></div></section>}
      </div>}

      <nav className="bottom-nav"><button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}><span>⌂</span>Сегодня</button><button className={tab === "progress" ? "active" : ""} onClick={() => setTab("progress")}><span>◴</span>Прогресс</button><button className={tab === "community" ? "active" : ""} onClick={() => setTab("community")}><span>◌</span>Вместе</button>{me?.role === "admin" && <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}><span>⌘</span>Админ</button>}</nav>
    </section>

    {!me?.registered && <div className="modal-backdrop"><section className="modal"><span className="eyebrow">GOSUP GAMES | 31 день в игре</span><h2>Движение каждый день</h2><p>С 1 по 31 августа отмечайте осознанную физическую активность длительностью от 20 минут.</p><button className="text-button" onClick={() => setShowRules(true)}>Прочитать полные правила</button><label className="note-field">Отображаемое имя<input maxLength={120} value={name} onChange={(event) => setName(event.target.value)}/></label><label className="note-field">Подразделение<input maxLength={120} value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Необязательно"/></label><button className="primary" onClick={() => void register()}>Вступить в игру</button></section></div>}

    {showCheckin && <div className="modal-backdrop"><section className="modal"><button className="modal-close" onClick={() => setShowCheckin(false)}>×</button><span className="eyebrow">Активность дня</span><h2>Что сегодня делали?</h2><label className="note-field">Вид активности<select value={activityType} onChange={(event) => setActivityType(event.target.value)}>{activityTypes.map((type) => <option key={type}>{type}</option>)}</select></label>{activityType === "Другое" && <label className="note-field">Название активности<input maxLength={120} value={customActivityName} onChange={(event) => setCustomActivityName(event.target.value)}/><small>{fieldErrors.customActivityName?.[0]}</small></label>}<label className="note-field">Продолжительность, минут<input type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" maxLength={4} value={durationMinutes} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setDurationMinutes(event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""))}/><small>{fieldErrors.durationMinutes?.[0]}</small></label><label className="note-field">Описание<input maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Необязательно"/></label><label className="photo-proof">Фото подтверждения (1–2)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void selectEvidencePhotos(event)}/><span className="photo-proof-grid">{evidencePhotos.map((photo, index) => <img key={index} src={photo} alt={`Подтверждение ${index + 1}`}/>)}</span><small>{fieldErrors.evidencePhotos?.[0] || "Обязательно приложите одно или два фото"}</small></label><button className="primary" onClick={() => void checkin()}>Сохранить активность</button></section></div>}

    {showRules && <div className="modal-backdrop"><section className="modal rules-modal"><button className="modal-close" onClick={() => setShowRules(false)}>×</button><span className="eyebrow">Правила</span><h2>31 день в игре</h2><p>Игровой день: 00:00–23:59 по Москве. Подходит любая выделенная физическая активность от 20 минут. К каждой активности обязательно приложите фото из приложения или с часов. Если такой возможности нет — сфотографируйте себя рядом с местом или инвентарём для спортивной активности. Несколько тренировок можно сохранить, но календарный день и серия увеличиваются максимум на один. Пропуск обнуляет текущую серию, но не исключает из игры. 20 активных дней дают допуск к розыгрышу. Спортивные результаты участников не сравниваются.</p><b>Не важно, что ты делаешь. Важно — не останавливаться.</b></section></div>}
    {showAvatarEditor && <div className="modal-backdrop"><section className="modal avatar-modal"><button className="modal-close" onClick={() => setShowAvatarEditor(false)}>×</button><span className="eyebrow">Профиль</span><h2>Ваше фото</h2><div className="avatar-preview">{avatarPhoto ? <img src={avatarPhoto} alt="Текущая фотография профиля"/> : <span>{initials}</span>}</div><p>Выберите фотографию — мы аккуратно обрежем её по центру. Она сохранится только на этом устройстве.</p><input ref={avatarInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void selectAvatar(event)}/><button className="primary" onClick={() => avatarInput.current?.click()}>{avatarPhoto ? "Заменить фото" : "Выбрать фото"}</button>{avatarPhoto && <button className="text-button avatar-remove" onClick={removeAvatar}>Удалить фото</button>}</section></div>}
    {achievementToast && <div className="modal-backdrop"><section className="modal achievement-modal"><div className="achievement-modal-art"><img src={achievementCardSrc(achievementToast.code)} alt={`Карточка достижения «${achievementToast.name}»`} onError={(event) => { event.currentTarget.hidden = true; }}/><span aria-hidden="true">{achievementToast.emoji}</span></div><div className="achievement-counter">Новое достижение{achievementQueue.length > 1 ? ` · ещё ${achievementQueue.length - 1}` : ""}</div><h2>{achievementToast.name}</h2><p>{achievementToast.description}</p><button className="primary" onClick={dismissAchievementToast}>{achievementQueue.length > 1 ? `Следующее (${achievementQueue.length - 1})` : "Продолжить"}</button></section></div>}
    {toast && <div className="toast">{toast}</div>}
  </main>;
}
