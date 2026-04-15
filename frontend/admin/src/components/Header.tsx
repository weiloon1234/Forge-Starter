import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Menu, ChevronDown } from "lucide-react";
import { auth } from "@/auth";
import { AccountDropdown } from "@/components/AccountDropdown";

interface HeaderProps {
  onToggleSidebar: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const { t } = useTranslation();
  const { user } = auth.useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <header className="sf-header">
      <button
        type="button"
        className="sf-header-hamburger"
        onClick={onToggleSidebar}
        aria-label={t("Toggle sidebar")}
      >
        <Menu size={20} />
      </button>

      <div className="sf-header-spacer" />

      <div className="sf-account" ref={containerRef}>
        <button
          type="button"
          className="sf-account-trigger"
          onClick={() => setOpen((o) => !o)}
        >
          <div className="sf-account-avatar">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="sf-account-info">
            <span className="sf-account-name">{user?.name}</span>
            <span className="sf-account-role">
              {t(`admin_type.${user?.admin_type ?? ""}`)}
            </span>
          </div>
          <ChevronDown
            size={16}
            className={`sf-account-chevron ${open ? "sf-account-chevron--open" : ""}`}
          />
        </button>

        {open && <AccountDropdown onClose={close} />}
      </div>
    </header>
  );
}
