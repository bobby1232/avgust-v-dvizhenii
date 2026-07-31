import type { Metadata } from "next";
import "./globals.css";
import "./database.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "https://august.rilabs.tech"),
  title: "Август в движении",
  description: "Telegram Mini App для спортивного соревнования",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "Август в движении",
    description: "31 день в своём ритме",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Август в движении" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Август в движении",
    description: "31 день в своём ритме",
    images: ["/og.png"],
  },
};

const telegramBootstrap = `
(function () {
  function postReadyEvent() {
    try {
      if (window.TelegramWebviewProxy && typeof window.TelegramWebviewProxy.postEvent === 'function') {
        window.TelegramWebviewProxy.postEvent('web_app_ready', '{}');
        return;
      }
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.TelegramWebviewProxy) {
        window.webkit.messageHandlers.TelegramWebviewProxy.postMessage(JSON.stringify({
          eventType: 'web_app_ready',
          eventData: {}
        }));
      }
    } catch (_) {}
  }

  function initializeTelegram() {
    var webApp = window.Telegram && window.Telegram.WebApp;
    if (!webApp) return false;
    try { webApp.ready(); } catch (_) {}
    try { webApp.expand(); } catch (_) {}
    return true;
  }

  // Never let the external Telegram CDN keep the native iOS loader visible.
  postReadyEvent();
  if (!initializeTelegram()) {
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      if (initializeTelegram() || attempts >= 100) clearInterval(timer);
    }, 50);
  }
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <head>
        <script dangerouslySetInnerHTML={{ __html: telegramBootstrap }} />
        {/* The SDK enhances Telegram integration, but it must never block HTML,
            React hydration, or URL-based tgWebAppData authentication. */}
        <script src="https://telegram.org/js/telegram-web-app.js?63" async />
      </head>
      <body>{children}</body>
    </html>
  );
}
