import type { Permission } from "@shared/types/generated";
import type { LucideIcon } from "lucide-react";
import {
  FileText,
  LayoutDashboard,
  MoreHorizontal,
  Shield,
  Users,
} from "lucide-react";

export type MenuItem = {
  key: string;
  label: string;
  icon?: LucideIcon;
  path?: string;
  permission?: Permission;
  notification?: string;
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
        key: "other.logs",
        label: "Logs",
        path: "/logs",
        icon: FileText,
        permission: "logs.read",
      },
    ],
  },
];
