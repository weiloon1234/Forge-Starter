import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { sideMenu } from "@/config/side-menu";
import type { MenuItem } from "@/config/side-menu";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const item of sideMenu) {
      if (item.children?.some((c) => c.path && pathname.startsWith(c.path))) {
        initial.add(item.key);
      }
    }
    return initial;
  });

  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

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
        {sideMenu.map((item) =>
          item.children ? (
            <ParentItem
              key={item.key}
              item={item}
              expanded={expanded.has(item.key)}
              onToggle={() => toggleExpand(item.key)}
              pathname={pathname}
            />
          ) : (
            <LeafItem key={item.key} item={item} />
          ),
        )}
      </nav>
    </aside>
  );
}

function LeafItem({ item }: { item: MenuItem }) {
  const { t } = useTranslation();

  return (
    <NavLink
      to={item.path!}
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
  item: MenuItem;
  expanded: boolean;
  onToggle: () => void;
  pathname: string;
}) {
  const { t } = useTranslation();
  const hasActiveChild = item.children!.some(
    (c) => c.path && pathname.startsWith(c.path),
  );

  return (
    <div>
      <button
        type="button"
        className={`sf-sidebar-item ${hasActiveChild ? "sf-sidebar-item--active-parent" : ""}`}
        onClick={onToggle}
      >
        {item.icon && <item.icon className="sf-sidebar-item-icon" />}
        <span>{t(item.label)}</span>
        <ChevronDown
          className={`sf-sidebar-chevron ${expanded ? "sf-sidebar-chevron--open" : ""}`}
        />
      </button>

      {expanded && (
        <div className="sf-sidebar-children">
          {item.children!.map((child) => (
            <NavLink
              key={child.key}
              to={child.path!}
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
