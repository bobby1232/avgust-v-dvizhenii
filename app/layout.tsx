import type { Metadata } from "next";
import "./globals.css";
import "./database.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://avgust-v-dvizhenii-production.up.railway.app"),
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
  function postTelegramEvent(eventType, eventData) {
    var payload = eventData || {};
    try {
      if (window.TelegramWebviewProxy && typeof window.TelegramWebviewProxy.postEvent === 'function') {
        window.TelegramWebviewProxy.postEvent(eventType, JSON.stringify(payload));
        return true;
      }
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.TelegramWebviewProxy) {
        window.webkit.messageHandlers.TelegramWebviewProxy.postMessage(JSON.stringify({
          eventType: eventType,
          eventData: payload
        }));
        return true;
      }
      if (window.external && typeof window.external.notify === 'function') {
        window.external.notify(JSON.stringify({ eventType: eventType, eventData: payload }));
        return true;
      }
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(JSON.stringify({ eventType: eventType, eventData: payload }), '*');
        return true;
      }
    } catch (_) {}
    return false;
  }

  // Telegram iOS keeps its native loader visible until web_app_ready is sent.
  // Send it directly so loading the external SDK cannot block the first paint.
  postTelegramEvent('web_app_ready', {});

  var attempts = 0;
  var timer = setInterval(function () {
    attempts += 1;
    var webApp = window.Telegram && window.Telegram.WebApp;
    if (webApp) {
      try { webApp.ready(); } catch (_) {}
      try { webApp.expand(); } catch (_) {}
      clearInterval(timer);
    } else {
      if (attempts % 20 === 0) postTelegramEvent('web_app_ready', {});
      if (attempts >= 200) clearInterval(timer);
    }
  }, 50);
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <head>
        <script dangerouslySetInnerHTML={{ __html: telegramBootstrap }} />
        <script src="https://telegram.org/js/telegram-web-app.js?59" defer />
      </head>
      <body>{children}</body>
    </html>
  );
}
