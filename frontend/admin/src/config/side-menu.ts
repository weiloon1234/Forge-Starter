import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Users, Settings } from "lucide-react";

export type MenuItem = {
  key: string;
  label: string;
  icon?: LucideIcon;
  path?: string;
  permission?: string;
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
        permission: "users.view",
      },
      {
        key: "users.admins",
        label: "Admins",
        path: "/users/admins",
        permission: "admins.view",
      },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    path: "/settings",
    permission: "settings.view",
  },
];
