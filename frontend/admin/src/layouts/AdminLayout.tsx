import { useState, useCallback } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="sf-layout">
      {sidebarOpen && (
        <div className="sf-sidebar-backdrop" onClick={closeSidebar} />
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
