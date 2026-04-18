import { createBrowserRouter } from "react-router-dom";
import { AdminLayout } from "@/layouts/AdminLayout";
import { AdminFormPage } from "@/pages/AdminFormPage";
import { AdminsPage } from "@/pages/AdminsPage";
import { CountryPage } from "@/pages/CountryPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ErrorPage } from "@/pages/ErrorPage";
import { LogsPage } from "@/pages/LogsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { UsersPage } from "@/pages/UsersPage";

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
        { path: "logs", element: <LogsPage /> },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: "/admin" },
);
