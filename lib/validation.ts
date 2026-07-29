import { z } from "zod";
export const activityTypes = ["Бег", "Прогулка", "Йога", "Велосипед"] as const;
const trimmed = (max: number) => z.string().trim().min(1).max(max);
export const authSchema = z.object({ initData: z.string().max(10_000).default("") });
export const registerSchema = z.object({ displayName: trimmed(120), department: z.string().trim().max(120).optional().default("") });
export const activitySchema = z.object({ activityType: z.enum(activityTypes), description: z.string().trim().max(300).optional().default(""), activityDate: z.iso.date().optional() });
export const resetSchema = z.object({ confirmation: z.literal("НАЧАТЬ ЗАНОВО") });
