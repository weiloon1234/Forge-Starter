import { createBrowserRouter } from "react-router-dom";
import { DeveloperOnlyRoute } from "@/components/DeveloperOnlyRoute";
import { AdminLayout } from "@/layouts/AdminLayout";
import { AdminFormPage } from "@/pages/AdminFormPage";
import { AdminsPage } from "@/pages/AdminsPage";
import { CountryPage } from "@/pages/CountryPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ErrorPage } from "@/pages/ErrorPage";
import { JobsDashboardPage } from "@/pages/JobsDashboardPage";
import { LogsPage } from "@/pages/LogsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { PageFormPage } from "@/pages/PageFormPage";
import { PagesPage } from "@/pages/PagesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { UsersPage } from "@/pages/UsersPage";
import { WebSocketDashboardPage } from "@/pages/WebSocketDashboardPage";

export const router = createBrowserRouter(
  [
    {
      element: <AdminLayout />,
      errorElement: <ErrorPage />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: "users", element: <UsersPage /> },
        { path: "admins", element: <AdminsPage /> },
        { path: "admins/new", element: <AdminFormPage /> },
        { path: "admins/:id", element: <AdminFormPage /> },
        { path: "countries", element: <CountryPage /> },
        { path: "pages", element: <PagesPage /> },
        { path: "pages/new", element: <PageFormPage /> },
        { path: "pages/:id", element: <PageFormPage /> },
        { path: "settings", element: <SettingsPage /> },
        { path: "logs", element: <LogsPage /> },
        {
          path: "other/jobs",
          element: (
            <DeveloperOnlyRoute>
              <JobsDashboardPage />
            </DeveloperOnlyRoute>
          ),
        },
        {
          path: "other/websocket",
          element: (
            <DeveloperOnlyRoute>
              <WebSocketDashboardPage />
            </DeveloperOnlyRoute>
          ),
        },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: "/admin" },
);
