import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { TelegramIdentity } from "./telegram";

const COOKIE = "avgust_session";
const MAX_AGE = 60 * 60 * 24 * 30;
type Session = TelegramIdentity & { exp: number };

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return value;
}
function sign(payload: string) { return createHmac("sha256", secret()).update(payload).digest("base64url"); }

export async function createSession(identity: TelegramIdentity) {
  const payload = Buffer.from(JSON.stringify({ ...identity, exp: Math.floor(Date.now() / 1000) + MAX_AGE })).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE });
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
  return value.exp > Date.now() / 1000 ? value : null;
}
