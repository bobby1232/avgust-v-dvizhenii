import type { Metadata } from "next";
import Script from "next/script";
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        {children}
      </body>
    </html>
  );
}
