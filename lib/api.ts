import { NextResponse } from "next/server";
import { getSession } from "./session";
import { isAdminTelegramId } from "./telegram";
import type { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}
export function zodDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    details[key] = [...(details[key] ?? []), issue.message];
  }
  return details;
}
export async function requireSession() { const session = await getSession(); if (!session) throw new ApiError(401, "Требуется авторизация в Telegram", "UNAUTHORIZED"); return session; }
export async function requireAdmin() { const session = await requireSession(); if (!isAdminTelegramId(session.id)) throw new ApiError(403, "Недостаточно прав", "FORBIDDEN"); return session; }
export function jsonError(error: unknown, context: string) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: error.status },
    );
  }
  console.error(`[${context}]`, error);
  return NextResponse.json({ error: "Сервис временно недоступен. Повторите попытку позже.", code: "INTERNAL_ERROR" }, { status: 500 });
}
