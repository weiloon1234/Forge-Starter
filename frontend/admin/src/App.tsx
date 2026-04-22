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
    auth.check();
    return auth.onAuthChange(async (user) => {
      if (!user) {
        adminBadges.reset();
        ws.disconnect();
        return;
      }
      const currentLocale = localeStore.locale;
      if (user.locale !== currentLocale) {
        api.put("/profile/locale", { locale: currentLocale }).catch(() => {});
      }

      // Hydrate badges before connecting so WS deltas arriving right after the
      // connect already have a populated allowlist.
      try {
        const { data } = await api.get<BadgeCountsResponse>("/badges");
        adminBadges.hydrate(data.counts);
      } catch {
        adminBadges.hydrate({});
      }

      ws.connect();
      ws.subscribe("admin:presence");
      ws.subscribe("admin:badges");
      ws.on("admin:badges", "badge:updated", (payload) => {
        const data = payload as { key: string; count: number };
        if (!adminBadges.knows(data.key)) return;
        adminBadges.set(data.key, data.count);
      });
      // TODO(badges): refetch snapshot on WS reconnect once createWebSocket exposes
      // a reconnect hook. Current behavior: counts may go stale until next login.
    });
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
