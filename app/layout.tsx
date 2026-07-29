import type { Metadata } from "next";
import "./globals.css";
import "./database.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://avgust-v-dvizhenii.ilya777999.chatgpt.site"),
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
  var attempts = 0;
  var timer = setInterval(function () {
    attempts += 1;
    var webApp = window.Telegram && window.Telegram.WebApp;
    if (webApp) {
      try { webApp.ready(); } catch (_) {}
      try { webApp.expand(); } catch (_) {}
      clearInterval(timer);
    } else if (attempts >= 100) {
      clearInterval(timer);
    }
  }, 50);
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js?59" />
        <script dangerouslySetInnerHTML={{ __html: telegramBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
