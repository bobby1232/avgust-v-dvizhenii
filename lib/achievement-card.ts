import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const achievementCardCodes = [
  "STREAK_3",
  "STREAK_7",
  "STREAK_14",
  "STREAK_21",
  "STREAK_31",
  "FIRST_SUP",
  "RUNNER",
  "WORKOUT",
  "EARLY_START",
  "FAMILY",
  "WITH_FRIEND",
  "BAD_WEATHER",
  "RECOVERY",
  "TRY_NEW",
  "WEEKEND",
  "RETURN",
] as const;

export type AchievementCardCode = typeof achievementCardCodes[number];

const knownCodes = new Set<string>(achievementCardCodes);
const dataUrlCache = new Map<string, Promise<string | null>>();

export function achievementCardUrl(code: string): string | null {
  return knownCodes.has(code) ? `/achievements/${code}.jpg` : null;
}

export async function achievementCardDataUrl(code: string): Promise<string | null> {
  if (!knownCodes.has(code)) return null;
  const cached = dataUrlCache.get(code);
  if (cached) return cached;

  const loaded = readFile(join(process.cwd(), "public", "achievements", `${code}.jpg`))
    .then((buffer) => `data:image/jpeg;base64,${buffer.toString("base64")}`)
    .catch((error: unknown) => {
      console.error(`[achievement-card:${code}]`, error instanceof Error ? error.message : error);
      return null;
    });
  dataUrlCache.set(code, loaded);
  return loaded;
}
