import { ApiError } from "./api";

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string; parameters?: { retry_after?: number } };

export class TelegramApiError extends Error {
  constructor(message: string, public readonly retryAfter?: number) { super(message); }
}

export async function telegramRequest<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new ApiError(503, "Telegram-бот не настроен", "BOT_NOT_CONFIGURED");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json() as TelegramResponse<T>;
  if (!response.ok || !result.ok || !result.result) {
    throw new TelegramApiError(result.description || `Telegram API ${response.status}`, result.parameters?.retry_after);
  }
  return result.result;
}

export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function splitTelegramHtml(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < Math.floor(limit / 2)) cut = limit;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest) parts.push(rest);
  return parts;
}

export function telegramActionButton(chatId: string, text: string, url: string) {
  // Telegram accepts web_app buttons only in private chats with the bot.
  // Group and supergroup IDs are negative, so use a regular URL button there.
  return chatId.startsWith("-")
    ? { text, url }
    : { text, web_app: { url } };
}

export async function sendLongTelegramMessage(chatId: string, text: string,
  options: { buttonText?: string; buttonUrl?: string } = {}) {
  const messages: Array<{ message_id: number }> = [];
  const parts = splitTelegramHtml(text);
  for (let index = 0; index < parts.length; index += 1) {
    messages.push(await sendTelegramMessage(chatId, parts[index], index === parts.length - 1 ? options : {}));
  }
  return messages;
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options: { buttonText?: string; buttonUrl?: string } = {},
): Promise<{ message_id: number }> {
  const replyMarkup = options.buttonText && options.buttonUrl ? {
    inline_keyboard: [[telegramActionButton(chatId, options.buttonText, options.buttonUrl)]],
  } : undefined;
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

export function appUrl(): string {
  const value = process.env.APP_URL;
  if (!value) throw new ApiError(503, "APP_URL не настроен", "APP_URL_NOT_CONFIGURED");
  return value.replace(/\/$/, "");
}
