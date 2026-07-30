"use client";

import { useEffect, useState, type ReactNode } from "react";

type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
};

type TelegramWindow = Window & {
  Telegram?: { WebApp?: TelegramWebApp };
  TelegramWebviewProxy?: { postEvent?: (eventType: string, eventData: string) => void };
  webkit?: { messageHandlers?: { TelegramWebviewProxy?: unknown } };
};

function launchParams(): URLSearchParams[] {
  return [
    new URLSearchParams(window.location.hash.replace(/^#/, "")),
    new URLSearchParams(window.location.search.replace(/^\?/, "")),
  ];
}

function readTelegramInitData(): string {
  const host = window as TelegramWindow;
  const sdkData = host.Telegram?.WebApp?.initData?.trim();
  if (sdkData) return sdkData;

  for (const params of launchParams()) {
    const value = params.get("tgWebAppData")?.trim();
    if (value) return value;
  }
  return "";
}

function isTelegramContext(): boolean {
  const host = window as TelegramWindow;
  const params = launchParams();
  return Boolean(
    host.Telegram?.WebApp
      || host.TelegramWebviewProxy?.postEvent
      || host.webkit?.messageHandlers?.TelegramWebviewProxy
      || window.parent !== window
      || params.some((item) => item.has("tgWebAppData") || item.has("tgWebAppVersion"))
      || /Telegram/i.test(window.navigator.userAgent),
  );
}

function exposeInitData(initData: string): void {
  const host = window as TelegramWindow;
  host.Telegram ??= {};
  host.Telegram.WebApp ??= {};
  if (!host.Telegram.WebApp.initData) host.Telegram.WebApp.initData = initData;
}

function notifyTelegramReady(): void {
  const webApp = (window as TelegramWindow).Telegram?.WebApp;
  try { webApp?.ready?.(); } catch {}
  try { webApp?.expand?.(); } catch {}
}

export default function TelegramGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isTelegramContext()) {
      setReady(true);
      return;
    }

    let cancelled = false;
    let timer = 0;
    const deadline = Date.now() + 8_000;

    const check = () => {
      if (cancelled) return;
      notifyTelegramReady();

      const initData = readTelegramInitData();
      if (initData) {
        exposeInitData(initData);
        setReady(true);
        return;
      }

      if (Date.now() >= deadline) {
        setReady(true);
        return;
      }

      timer = window.setTimeout(check, 50);
    };

    check();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!ready) {
    return (
      <main className="app-shell">
        <section className="phone">
          <div className="page-heading">
            <p>GOSUP GAMES</p>
            <h1>Подключаем Telegram…</h1>
          </div>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
