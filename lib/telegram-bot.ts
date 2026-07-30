import { ApiError } from "./api";

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };

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
    throw new Error(result.description || `Telegram API ${response.status}`);
  }
  return result.result;
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options: { buttonText?: string; buttonUrl?: string } = {},
): Promise<{ message_id: number }> {
  const replyMarkup = options.buttonText && options.buttonUrl ? {
    inline_keyboard: [[{
      text: options.buttonText,
      web_app: { url: options.buttonUrl },
    }]],
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
