import { useTranslation } from "react-i18next";
import { Globe, User, Lock, LogOut } from "lucide-react";
import { useLocale, localeStore, LOCALE_LABELS } from "@shared/i18n";
import { modal } from "@shared/modal";
import { auth } from "@/auth";
import { api } from "@/api";
import { EditProfileModal } from "@/components/EditProfileModal";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";

interface AccountDropdownProps {
  onClose: () => void;
}

export function AccountDropdown({ onClose }: AccountDropdownProps) {
  const { t } = useTranslation();
  const { locale, available } = useLocale();
  const { user } = auth.useAuth();

  const openProfile = () => {
    onClose();
    modal.open(EditProfileModal, {
      name: user?.name ?? "",
      email: user?.email ?? "",
    }, { title: t("My Profile") });
  };

  const openSecurity = () => {
    onClose();
    modal.open(ChangePasswordModal, undefined, { title: t("Account Security") });
  };

  return (
    <div className="sf-account-dropdown">
      <div className="sf-account-section">
        <div className="sf-account-locale">
          <Globe size={16} className="sf-account-item-icon" />
          <span className="sf-account-locale-label">{t("Language")}</span>
          <div className="sf-account-locale-switcher">
            {available.map((code) => (
              <button
                key={code}
                type="button"
                className={`sf-account-locale-btn ${locale === code ? "sf-account-locale-btn--active" : ""}`}
                onClick={() => {
                  if (code === locale) return;
                  localeStore.setLocale(code);
                  api.put("/profile/locale", { locale: code }).catch(() => {});
                }}
              >
                {LOCALE_LABELS[code] ?? code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="sf-account-section">
        <button type="button" className="sf-account-item" onClick={openProfile}>
          <User size={16} className="sf-account-item-icon" />
          <span>{t("My Profile")}</span>
        </button>
        <button type="button" className="sf-account-item" onClick={openSecurity}>
          <Lock size={16} className="sf-account-item-icon" />
          <span>{t("Account Security")}</span>
        </button>
      </div>

      <div className="sf-account-section sf-account-section--last">
        <button
          type="button"
          className="sf-account-item sf-account-item--danger"
          onClick={() => auth.logout()}
        >
          <LogOut size={16} className="sf-account-item-icon" />
          <span>{t("Log out")}</span>
        </button>
      </div>
    </div>
  );
}
