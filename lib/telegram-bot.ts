import { ApiError } from "./api";

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string; parameters?: {
  retry_after?: number;
  migrate_to_chat_id?: number;
} };

export type TelegramMessageOptions = {
  buttonText?: string;
  buttonUrl?: string;
  messageThreadId?: number;
};

export class TelegramApiError extends Error {
  constructor(message: string, public readonly retryAfter?: number) { super(message); }
}

function migratedChatId<T>(result: TelegramResponse<T>): string | undefined {
  const chatId = result.parameters?.migrate_to_chat_id;
  return typeof chatId === "number" ? String(chatId) : undefined;
}

function positiveMessageThreadId(value: unknown, source: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ApiError(503, `${source} должен быть положительным целым числом`, "INVALID_MESSAGE_THREAD_ID");
  }
  return parsed;
}

export function telegramMessageThreadId(chatId: string, explicit?: number): number | undefined {
  const explicitThreadId = positiveMessageThreadId(explicit, "messageThreadId");
  if (explicitThreadId !== undefined) return explicitThreadId;

  const reportChatId = process.env.TELEGRAM_REPORT_CHAT_ID?.trim();
  if (!reportChatId || reportChatId !== chatId) return undefined;
  return positiveMessageThreadId(
    process.env.TELEGRAM_REPORT_MESSAGE_THREAD_ID,
    "TELEGRAM_REPORT_MESSAGE_THREAD_ID",
  );
}

export async function telegramRequest<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new ApiError(503, "Telegram-бот не настроен", "BOT_NOT_CONFIGURED");
  const request = async (requestBody: Record<string, unknown>) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    return { response, result: await response.json() as TelegramResponse<T> };
  };
  let { response, result } = await request(body);
  const newChatId = migratedChatId(result);
  if (newChatId && Object.hasOwn(body, "chat_id")) {
    ({ response, result } = await request({ ...body, chat_id: newChatId }));
  }
  if (!response.ok || !result.ok || result.result === undefined) {
    throw new TelegramApiError(result.description || `Telegram API ${response.status}`, result.parameters?.retry_after);
  }
  return result.result;
}

function dataUrlFile(value: string, index: number) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new ApiError(400, "Некорректный формат фотографии", "INVALID_PHOTO");
  const extension = match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1];
  return new File([Buffer.from(match[2], "base64")], `activity-${index}.${extension}`, { type: match[1] });
}

async function telegramMultipartRequest<T>(
  method: string,
  chatId: string,
  createForm: (targetChatId: string) => FormData,
): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new ApiError(503, "Telegram-бот не настроен", "BOT_NOT_CONFIGURED");
  const request = async (targetChatId: string) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      body: createForm(targetChatId),
    });
    return { response, result: await response.json() as TelegramResponse<T> };
  };
  let { response, result } = await request(chatId);
  const newChatId = migratedChatId(result);
  if (newChatId) ({ response, result } = await request(newChatId));
  if (!response.ok || !result.ok || result.result === undefined) {
    throw new TelegramApiError(result.description || `Telegram API ${response.status}`, result.parameters?.retry_after);
  }
  return result.result;
}

export async function sendTelegramPhotoPost(
  chatId: string,
  photos: string[],
  caption: string,
  options: Pick<TelegramMessageOptions, "messageThreadId"> = {},
): Promise<{ message_id: number }> {
  if (!photos.length) return sendTelegramMessage(chatId, caption, options);
  const messageThreadId = telegramMessageThreadId(chatId, options.messageThreadId);
  if (photos.length === 1) {
    return telegramMultipartRequest<{ message_id: number }>("sendPhoto", chatId, (targetChatId) => {
      const form = new FormData();
      form.set("chat_id", targetChatId);
      if (messageThreadId !== undefined) form.set("message_thread_id", String(messageThreadId));
      form.set("photo", dataUrlFile(photos[0], 0));
      form.set("caption", caption);
      form.set("parse_mode", "HTML");
      return form;
    });
  }
  if (photos.length > 10) throw new ApiError(400, "Можно отправить не более 10 фотографий", "TOO_MANY_PHOTOS");
  const messages = await telegramMultipartRequest<Array<{ message_id: number }>>("sendMediaGroup", chatId, (targetChatId) => {
    const form = new FormData();
    form.set("chat_id", targetChatId);
    if (messageThreadId !== undefined) form.set("message_thread_id", String(messageThreadId));
    const media = photos.map((photo, index) => {
      const key = `photo${index}`;
      form.set(key, dataUrlFile(photo, index));
      return { type: "photo", media: `attach://${key}`, ...(index === 0 ? { caption, parse_mode: "HTML" } : {}) };
    });
    form.set("media", JSON.stringify(media));
    return form;
  });
  if (!messages.length) throw new TelegramApiError("Telegram API returned an empty media group");
  return messages[0];
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

export async function sendLongTelegramMessage(
  chatId: string,
  text: string,
  options: TelegramMessageOptions = {},
) {
  const messages: Array<{ message_id: number }> = [];
  const parts = splitTelegramHtml(text);
  for (let index = 0; index < parts.length; index += 1) {
    const partOptions = index === parts.length - 1
      ? options
      : { messageThreadId: options.messageThreadId };
    messages.push(await sendTelegramMessage(chatId, parts[index], partOptions));
  }
  return messages;
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options: TelegramMessageOptions = {},
): Promise<{ message_id: number }> {
  const replyMarkup = options.buttonText && options.buttonUrl ? {
    inline_keyboard: [[telegramActionButton(chatId, options.buttonText, options.buttonUrl)]],
  } : undefined;
  const messageThreadId = telegramMessageThreadId(chatId, options.messageThreadId);
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    ...(messageThreadId !== undefined ? { message_thread_id: messageThreadId } : {}),
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
