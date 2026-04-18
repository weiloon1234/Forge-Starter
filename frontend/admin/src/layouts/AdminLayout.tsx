import { Button } from "@shared/components";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";

export function AdminLayout() {
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="sf-layout">
      {sidebarOpen && (
        <Button
          type="button"
          unstyled
          ariaLabel={t("Close")}
          className="sf-sidebar-backdrop"
          onClick={closeSidebar}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={closeSidebar} />

      <div className="sf-layout-main">
        <Header onToggleSidebar={toggleSidebar} />
        <main className="sf-layout-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
