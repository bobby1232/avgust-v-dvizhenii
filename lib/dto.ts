export type ActivityStatus = "approved" | "pending" | "rejected";

export type CompetitionDto = {
  id: number;
  name: string;
  startDate: string;
  endDate: string | null;
  timezone: string;
  isActive: boolean;
};

export type AchievementDto = {
  id: number;
  code: string;
  name: string;
  description: string;
  emoji: string;
  awardedAt?: string | Date;
  source?: string;
};

export type ProgressDto = {
  activeDays: number;
  currentStreak: number;
  maxStreak: number;
  missedDays: number;
  checkedInToday: boolean;
  remainingToDraw: number;
  remainingToPerfectMonth: number;
  favoriteActivity: string | null;
  totalDurationMinutes: number;
  achievementCount: number;
  achievements: AchievementDto[];
  current: number;
  max: number;
};

export type ActivityDto = {
  id: number;
  activityDate: string;
  activityType: string;
  customActivityName: string | null;
  durationMinutes: number;
  description: string | null;
  status: ActivityStatus;
  moderationComment: string | null;
  createdAt: string | Date;
};

export type ProfileDto = {
  id: number;
  displayName: string;
  department: string | null;
  registeredAt: string | Date;
  isActive: boolean;
  notificationsEnabled: boolean;
  role: "participant" | "admin";
};

export type ParticipantDto = {
  id: number;
  displayName: string;
  department: string | null;
  registeredAt: string | Date;
  isActive: boolean;
  notificationsEnabled: boolean;
  activeDays: number;
  currentStreak: number;
  maxStreak: number;
  missedDays: number;
  achievementCount: number;
};

export type AdminActivityDto = {
  activity: ActivityDto & { userId: number };
  participant: string;
};
