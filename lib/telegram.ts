import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramIdentity = { id: string; username?: string; firstName?: string; lastName?: string };

export function validateTelegramInitData(initData: string, now = Date.now()): TelegramIdentity {
  if (!initData && process.env.NODE_ENV !== "production" && process.env.DEV_TELEGRAM_USER_ID) {
    return { id: process.env.DEV_TELEGRAM_USER_ID, firstName: "Developer" };
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram authentication is not configured");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") ?? "";
  params.delete("hash");
  const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(dataCheck).digest("hex");
  if (hash.length !== expected.length || !timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) throw new Error("Invalid Telegram signature");
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || Math.abs(now / 1000 - authDate) > 86_400) throw new Error("Telegram data has expired");
  const raw = params.get("user");
  if (!raw) throw new Error("Telegram user is missing");
  const user = JSON.parse(raw) as { id?: number | string; username?: string; first_name?: string; last_name?: string };
  if (!user.id || !/^\d+$/.test(String(user.id))) throw new Error("Invalid Telegram user");
  return { id: String(user.id), username: user.username, firstName: user.first_name, lastName: user.last_name };
}

export function isAdminTelegramId(id: string): boolean {
  return (process.env.ADMIN_TELEGRAM_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean).includes(id);
}
