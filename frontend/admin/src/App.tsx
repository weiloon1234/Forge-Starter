import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { ModalProvider } from "@shared/modal";
import { localeStore } from "@shared/i18n";
import { auth } from "@/auth";
import { api } from "@/api";
import { ws } from "@/websocket";
import { LoginPage } from "@/pages/LoginPage";
import { router } from "@/router";

export default function App() {
  const { authenticated, busy } = auth.useAuth();

  useEffect(() => {
    auth.check();
    return auth.onAuthChange((user) => {
      if (!user) {
        ws.disconnect();
        return;
      }
      const currentLocale = localeStore.locale;
      if (user.locale !== currentLocale) {
        api.put("/profile/locale", { locale: currentLocale }).catch(() => {});
      }
      ws.connect();
      ws.subscribe("admin:presence");
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
