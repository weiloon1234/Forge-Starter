import { Button } from "@shared/components";
import { getLocaleLabel, localeStore, useLocale } from "@shared/i18n";
import { modal } from "@shared/modal";
import { Globe, Lock, LogOut, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { auth } from "@/auth";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { EditProfileModal } from "@/components/EditProfileModal";

interface AccountDropdownProps {
  onClose: () => void;
}

export function AccountDropdown({ onClose }: AccountDropdownProps) {
  const { t } = useTranslation();
  const { locale, available } = useLocale();
  const { user } = auth.useAuth();

  const openProfile = () => {
    onClose();
    modal.open(
      EditProfileModal,
      {
        name: user?.name ?? "",
        email: user?.email ?? "",
      },
      { title: t("My Profile") },
    );
  };

  const openSecurity = () => {
    onClose();
    modal.open(ChangePasswordModal, undefined, {
      title: t("Account Security"),
    });
  };

  return (
    <div className="sf-account-dropdown">
      <div className="sf-account-section">
        <div className="sf-account-locale">
          <Globe size={16} className="sf-account-item-icon" />
          <span className="sf-account-locale-label">{t("Language")}</span>
          <div className="sf-account-locale-switcher">
            {available.map((code) => (
              <Button
                key={code}
                type="button"
                unstyled
                className={`sf-account-locale-btn ${locale === code ? "sf-account-locale-btn--active" : ""}`}
                onClick={() => {
                  if (code === locale) return;
                  localeStore.setLocale(code);
                  api.put("/profile/locale", { locale: code }).catch(() => {});
                }}
              >
                {getLocaleLabel(code, t)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="sf-account-section">
        <Button
          type="button"
          unstyled
          className="sf-account-item"
          onClick={openProfile}
        >
          <User size={16} className="sf-account-item-icon" />
          <span>{t("My Profile")}</span>
        </Button>
        <Button
          type="button"
          unstyled
          className="sf-account-item"
          onClick={openSecurity}
        >
          <Lock size={16} className="sf-account-item-icon" />
          <span>{t("Account Security")}</span>
        </Button>
      </div>

      <div className="sf-account-section sf-account-section--last">
        <Button
          type="button"
          unstyled
          className="sf-account-item sf-account-item--danger"
          onClick={() => auth.logout()}
        >
          <LogOut size={16} className="sf-account-item-icon" />
          <span>{t("Log out")}</span>
        </Button>
      </div>
    </div>
  );
}
