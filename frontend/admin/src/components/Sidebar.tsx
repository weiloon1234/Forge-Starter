import { Button } from "@shared/components";
import type { AdminType, Permission } from "@shared/types/generated";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";
import { hasAdminTypeAccess } from "@/adminAccess";
import { auth } from "@/auth";
import type { MenuItem } from "@/config/side-menu";
import { sideMenu } from "@/config/side-menu";
import { hasPermission } from "@/hooks/usePermission";

type LinkMenuItem = MenuItem & { path: string };
type ParentMenuItem = MenuItem & { children: MenuItem[] };

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

function hasPath(item: MenuItem): item is LinkMenuItem {
  return typeof item.path === "string" && item.path.length > 0;
}

function hasChildren(item: MenuItem): item is ParentMenuItem {
  return Array.isArray(item.children) && item.children.length > 0;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { user } = auth.useAuth();
  const visibleMenu = filterMenu(
    sideMenu,
    user?.abilities ?? [],
    user?.admin_type,
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const item of visibleMenu) {
      if (
        hasChildren(item) &&
        item.children.some(
          (child) => hasPath(child) && pathname.startsWith(child.path),
        )
      ) {
        initial.add(item.key);
      }
    }
    return initial;
  });

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!pathname) return;
    onCloseRef.current();
  }, [pathname]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <aside className={`sf-sidebar ${open ? "sf-sidebar--open" : ""}`}>
      <div className="sf-sidebar-brand">
        <span className="sf-sidebar-brand-icon">F</span>
        <span className="sf-sidebar-brand-text">{t("Admin Portal")}</span>
      </div>

      <nav className="sf-sidebar-nav">
        {visibleMenu.map((item) => {
          if (hasChildren(item)) {
            return (
              <ParentItem
                key={item.key}
                item={item}
                expanded={expanded.has(item.key)}
                onToggle={() => toggleExpand(item.key)}
                pathname={pathname}
              />
            );
          }

          if (hasPath(item)) {
            return <LeafItem key={item.key} item={item} />;
          }

          return null;
        })}
      </nav>
    </aside>
  );
}

function filterMenu(
  menu: MenuItem[],
  abilities: Permission[],
  adminType?: AdminType,
): MenuItem[] {
  return menu
    .map((item) => {
      if (
        item.permission &&
        !hasPermission(abilities, item.permission, adminType)
      ) {
        return null;
      }

      if (!hasAdminTypeAccess(adminType, item.adminTypes)) {
        return null;
      }

      if (hasChildren(item)) {
        const children = filterMenu(item.children, abilities, adminType);
        if (children.length === 0) {
          return null;
        }
        return { ...item, children };
      }

      return item;
    })
    .filter((item): item is MenuItem => item !== null);
}

function LeafItem({ item }: { item: LinkMenuItem }) {
  const { t } = useTranslation();

  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      className={({ isActive }) =>
        `sf-sidebar-item ${isActive ? "sf-sidebar-item--active" : ""}`
      }
    >
      {item.icon && <item.icon className="sf-sidebar-item-icon" />}
      <span>{t(item.label)}</span>
    </NavLink>
  );
}

function ParentItem({
  item,
  expanded,
  onToggle,
  pathname,
}: {
  item: ParentMenuItem;
  expanded: boolean;
  onToggle: () => void;
  pathname: string;
}) {
  const { t } = useTranslation();
  const children = item.children.filter(hasPath);
  const hasActiveChild = children.some((child) =>
    pathname.startsWith(child.path),
  );

  return (
    <div>
      <Button
        type="button"
        unstyled
        className={`sf-sidebar-item ${hasActiveChild ? "sf-sidebar-item--active-parent" : ""}`}
        onClick={onToggle}
      >
        {item.icon && <item.icon className="sf-sidebar-item-icon" />}
        <span>{t(item.label)}</span>
        <ChevronDown
          className={`sf-sidebar-chevron ${expanded ? "sf-sidebar-chevron--open" : ""}`}
        />
      </Button>

      {expanded && (
        <div className="sf-sidebar-children">
          {children.map((child) => (
            <NavLink
              key={child.key}
              to={child.path}
              className={({ isActive }) =>
                `sf-sidebar-child ${isActive ? "sf-sidebar-child--active" : ""}`
              }
            >
              <span>{t(child.label)}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
