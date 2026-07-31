import { z } from "zod";
export const defaultActivityTypes = [
  "Бег", "Ходьба", "SUP", "Велосипед", "Плавание", "Тренировка в зале",
  "Турник / воркаут", "Йога", "Растяжка", "Футбол", "Командная игра",
  "Семейная тренировка", "Тренировка с другом", "Другое",
] as const;
const trimmed = (max: number) => z.string().trim().min(1).max(max);
export const authSchema = z.object({ initData: z.string().max(10_000).default("") });
export const registerSchema = z.object({ displayName: trimmed(120), department: z.string().trim().max(120).optional().default("") });
export const activitySchema = z.object({
  activityType: trimmed(120),
  customActivityName: z.string().trim().max(120).optional().default(""),
  durationMinutes: z.number().int().min(20, "Для зачёта активность должна продолжаться не менее 20 минут.").max(1440),
  description: z.string().trim().max(300).optional().default(""),
  evidencePhotos: z.array(z.string().startsWith("data:image/").max(1_500_000)).min(1, "Приложите хотя бы одно фото").max(2, "Можно приложить не более двух фото"),
}).superRefine((value, context) => {
  if (value.activityType === "Другое" && !value.customActivityName) {
    context.addIssue({ code: "custom", path: ["customActivityName"], message: "Укажите название активности" });
  }
});
export const adminActivitySchema = z.object({
  userId: z.number().int().positive(),
  activityDate: z.iso.date(),
  activityType: trimmed(120),
  customActivityName: z.string().trim().max(120).optional().default(""),
  durationMinutes: z.number().int().min(20).max(1440),
  description: z.string().trim().max(300).optional().default(""),
  status: z.enum(["approved", "pending", "rejected"]).default("approved"),
  comment: z.string().trim().max(500).optional().default(""),
});
export const adminActivityPatchSchema = adminActivitySchema.partial().extend({
  id: z.number().int().positive(),
});
export const adminUserPatchSchema = z.object({
  id: z.number().int().positive(),
  displayName: z.string().trim().min(1).max(120).optional(),
  department: z.string().trim().max(120).nullable().optional(),
  isActive: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  comment: z.string().trim().max(500).optional(),
});
export const resetSchema = z.object({ confirmation: z.literal("НАЧАТЬ ЗАНОВО") });
export const createCompetitionSchema = z.object({
  name: trimmed(160),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  timezone: trimmed(64).default("Europe/Moscow"),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/, "Используйте формат ЧЧ:ММ").default("20:00"),
  comment: trimmed(500),
}).refine((value) => value.endDate >= value.startDate, {
  path: ["endDate"],
  message: "Дата окончания должна быть не раньше даты начала",
});
