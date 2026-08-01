import type { Metadata } from "next";
import "./globals.css";
import "./database.css";
import "./achievement-cards.css";

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
  function initializeTelegram() {
    var webApp = window.Telegram && window.Telegram.WebApp;
    if (!webApp) return;
    try { webApp.ready(); } catch (_) {}
    try { webApp.expand(); } catch (_) {}
  }

  initializeTelegram();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTelegram, { once: true });
  }
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <head>
        {/* Telegram requires its SDK in the head before application scripts. Keep
            this synchronous so mobile clients initialize WebApp and initData in
            the documented order. */}
        <script src="https://telegram.org/js/telegram-web-app.js?63" />
        <script dangerouslySetInnerHTML={{ __html: telegramBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
