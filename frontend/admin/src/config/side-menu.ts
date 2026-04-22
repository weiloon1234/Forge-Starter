import type { AdminType, Permission } from "@shared/types/generated";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Cable,
  Code2,
  FileText,
  Gauge,
  LayoutDashboard,
  MoreHorizontal,
  ScrollText,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { DEVELOPER_ONLY_ADMIN_TYPES } from "@/adminAccess";

export type MenuItem = {
  key: string;
  label: string;
  icon?: LucideIcon;
  path?: string;
  permission?: Permission;
  adminTypes?: readonly AdminType[];
  // e.g. "work.pending_topups" — must match an `AdminBadge::KEY` registered
  // in `src/providers/badge_service_provider.rs`. See CLAUDE.md "Admin Badge
  // System" for the full add-a-badge flow. Parents auto-sum visible children.
  badge?: string;
  children?: MenuItem[];
};

export const sideMenu: MenuItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    path: "/",
  },
  {
    key: "users",
    label: "Users",
    icon: Users,
    children: [
      {
        key: "users.list",
        label: "All Users",
        path: "/users",
        permission: "users.read",
      },
      {
        key: "users.introducer_changes",
        label: "admin.introducer_changes.title",
        path: "/users/introducer-changes",
        permission: "introducer_changes.read",
      },
      {
        key: "users.credit_transactions",
        label: "Credit Transactions",
        path: "/credits/transactions",
        permission: "credit_transactions.read",
      },
      {
        key: "users.credit_adjustments",
        label: "Credit Adjustments",
        path: "/credits/adjustments",
        icon: ScrollText,
        permission: "credits.read",
      },
      {
        key: "users.admins",
        label: "Admins",
        path: "/admins",
        icon: Shield,
        permission: "admins.read",
      },
    ],
  },
  {
    key: "other",
    label: "Other",
    icon: MoreHorizontal,
    children: [
      {
        key: "other.countries",
        label: "Countries",
        path: "/countries",
        permission: "countries.read",
      },
      {
        key: "other.settings",
        label: "Settings",
        path: "/settings",
        icon: Settings,
        permission: "settings.read",
      },
      {
        key: "other.pages",
        label: "Pages",
        path: "/pages",
        icon: ScrollText,
        permission: "pages.read",
      },
    ],
  },
  {
    key: "developer",
    label: "Developer",
    icon: Code2,
    adminTypes: DEVELOPER_ONLY_ADMIN_TYPES,
    children: [
      {
        key: "developer.logs",
        label: "Logs",
        path: "/developer/logs",
        icon: FileText,
        permission: "logs.read",
      },
      {
        key: "developer.http",
        label: "HTTP",
        path: "/developer/http",
        icon: Gauge,
        permission: "observability.view",
      },
      {
        key: "developer.jobs",
        label: "Jobs",
        path: "/developer/jobs",
        icon: Activity,
        permission: "observability.view",
      },
      {
        key: "developer.websocket",
        label: "WebSocket",
        path: "/developer/websocket",
        icon: Cable,
        permission: "observability.view",
      },
      {
        key: "developer.audit_logs",
        label: "admin.audit_logs.title",
        path: "/developer/audit-logs",
        icon: ScrollText,
        permission: "audit_logs.read",
      },
    ],
  },
];
