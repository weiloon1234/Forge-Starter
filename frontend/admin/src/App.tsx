import { localeStore } from "@shared/i18n";
import { ModalProvider } from "@shared/modal";
import type { BadgeCountsResponse } from "@shared/types/generated";
import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { api } from "@/api";
import { auth } from "@/auth";
import { LoginPage } from "@/pages/LoginPage";
import { router } from "@/router";
import { adminBadges } from "@/stores/badgeStore";
import { ws } from "@/websocket";

export default function App() {
  const { authenticated, busy } = auth.useAuth();

  useEffect(() => {
    let active = true;
    let sessionVersion = 0;
    let removeBadgeListener: (() => void) | null = null;
    let removeReconnectListener: (() => void) | null = null;

    const hydrateBadges = async (version: number) => {
      try {
        const { data } = await api.get<BadgeCountsResponse>("/badges");
        if (active && version === sessionVersion) {
          adminBadges.hydrate(data.counts);
        }
      } catch {
        if (active && version === sessionVersion) {
          adminBadges.hydrate({});
        }
      }
    };

    const unsubscribeAuth = auth.onAuthChange(async (user) => {
      sessionVersion += 1;
      const version = sessionVersion;
      removeBadgeListener?.();
      removeBadgeListener = null;
      removeReconnectListener?.();
      removeReconnectListener = null;

      if (!user) {
        adminBadges.reset();
        ws.disconnect();
        return;
      }
      const currentLocale = localeStore.locale;
      if (user.locale !== currentLocale) {
        api.put("/profile/locale", { locale: currentLocale }).catch(() => {});
      }

      await hydrateBadges(version);

      ws.connect();
      ws.subscribe("admin:presence");
      ws.subscribe("admin:badges");
      removeBadgeListener = ws.on(
        "admin:badges",
        "badge:updated",
        (payload) => {
          const data = payload as { key: string; count: number };
          if (!adminBadges.knows(data.key)) return;
          adminBadges.set(data.key, data.count);
        },
      );
      removeReconnectListener = ws.onReconnect(async () => {
        await hydrateBadges(version);
      });
    });

    void auth.check();

    return () => {
      active = false;
      unsubscribeAuth();
      removeBadgeListener?.();
      removeReconnectListener?.();
      ws.disconnect();
    };
  }, []);

  if (busy) return null;

  return (
    <>
      {authenticated ? <RouterProvider router={router} /> : <LoginPage />}
      <ModalProvider />
      <Toaster position="top-right" richColors />
    </>
  );
}
