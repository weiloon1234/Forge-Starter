import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Toaster } from "sonner";
import { ModalProvider } from "@shared/modal";
import { auth } from "@/auth";

export default function App() {
  const { t } = useTranslation();
  const { user, authenticated, busy } = auth.useAuth();

  useEffect(() => {
    auth.check();
  }, []);

  if (busy) return null;

  return (
    <>
      <div className="max-w-xl mx-auto py-16 px-4">
        <h1 className="text-2xl font-bold">{t("Forge Starter")}</h1>
        <p className="mt-2" style={{ color: "var(--color-text-muted)" }}>
          {authenticated ? t("greeting", { name: user?.name }) : t("User Portal")}
        </p>
      </div>
      <ModalProvider />
      <Toaster position="top-right" richColors />
    </>
  );
}
