import { createBrowserRouter } from "react-router-dom";
import { DeveloperOnlyRoute } from "@/components/DeveloperOnlyRoute";
import { AdminLayout } from "@/layouts/AdminLayout";
import { AdminFormPage } from "@/pages/AdminFormPage";
import { AdminsPage } from "@/pages/AdminsPage";
import { AuditLogsPage } from "@/pages/AuditLogsPage";
import { CountryPage } from "@/pages/CountryPage";
import { CreditAdjustmentsPage } from "@/pages/CreditAdjustmentsPage";
import { CreditTransactionsPage } from "@/pages/CreditTransactionsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ErrorPage } from "@/pages/ErrorPage";
import { HttpDashboardPage } from "@/pages/HttpDashboardPage";
import { IntroducerChangesPage } from "@/pages/IntroducerChangesPage";
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
        {
          path: "users/introducer-changes",
          element: <IntroducerChangesPage />,
        },
        { path: "credits/transactions", element: <CreditTransactionsPage /> },
        { path: "credits/adjustments", element: <CreditAdjustmentsPage /> },
        { path: "admins", element: <AdminsPage /> },
        { path: "admins/new", element: <AdminFormPage /> },
        { path: "admins/:id", element: <AdminFormPage /> },
        { path: "countries", element: <CountryPage /> },
        { path: "pages", element: <PagesPage /> },
        { path: "pages/new", element: <PageFormPage /> },
        { path: "pages/:id", element: <PageFormPage /> },
        { path: "settings", element: <SettingsPage /> },
        {
          path: "developer/logs",
          element: (
            <DeveloperOnlyRoute>
              <LogsPage />
            </DeveloperOnlyRoute>
          ),
        },
        {
          path: "developer/http",
          element: (
            <DeveloperOnlyRoute>
              <HttpDashboardPage />
            </DeveloperOnlyRoute>
          ),
        },
        {
          path: "developer/jobs",
          element: (
            <DeveloperOnlyRoute>
              <JobsDashboardPage />
            </DeveloperOnlyRoute>
          ),
        },
        {
          path: "developer/websocket",
          element: (
            <DeveloperOnlyRoute>
              <WebSocketDashboardPage />
            </DeveloperOnlyRoute>
          ),
        },
        {
          path: "developer/audit-logs",
          element: (
            <DeveloperOnlyRoute>
              <AuditLogsPage />
            </DeveloperOnlyRoute>
          ),
        },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: "/admin" },
);
