import { Button } from "@shared/components";
import { AdminTypeOptions } from "@shared/types/generated";
import { enumLabel } from "@shared/utils";
import { ChevronDown, Menu } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { auth } from "@/auth";
import { AccountDropdown } from "@/components/AccountDropdown";
import { ws } from "@/websocket";

interface HeaderProps {
  onToggleSidebar: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const { t } = useTranslation();
  const { user } = auth.useAuth();
  const wsStatus = ws.useStatus();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <header className="sf-header">
      <Button
        type="button"
        unstyled
        className="sf-header-hamburger"
        onClick={onToggleSidebar}
        ariaLabel={t("Toggle sidebar")}
      >
        <Menu size={20} />
      </Button>

      <div className="sf-header-spacer" />

      <div
        className={`sf-ws-status sf-ws-status--${wsStatus}`}
        title={t(wsStatus)}
      />

      <div className="sf-account" ref={containerRef}>
        <Button
          type="button"
          unstyled
          className="sf-account-trigger"
          onClick={() => setOpen((o) => !o)}
          ariaLabel={t("My Profile")}
        >
          <div className="sf-account-avatar">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="sf-account-info">
            <span className="sf-account-name">{user?.name}</span>
            <span className="sf-account-role">
              {user?.admin_type
                ? enumLabel(AdminTypeOptions, user.admin_type, t)
                : ""}
            </span>
          </div>
          <ChevronDown
            size={16}
            className={`sf-account-chevron ${open ? "sf-account-chevron--open" : ""}`}
          />
        </Button>

        {open && <AccountDropdown onClose={close} />}
      </div>
    </header>
  );
}
