import { Button } from "@shared/components";
import {
  getLocaleFlag,
  getLocaleLabel,
  localeStore,
  useLocale,
} from "@shared/i18n";
import { modal } from "@shared/modal";
import { Lock, LogOut, User } from "lucide-react";
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
  const { user } = auth.useAuth();
  const { locale, available } = useLocale();

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

  const selectLocale = (code: string) => {
    if (code === locale) {
      return;
    }

    localeStore.setLocale(code);
    api.put("/profile/locale", { locale: code }).catch(() => {});
  };

  return (
    <div className="sf-account-dropdown">
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

      <div className="sf-account-section sf-account-section--locale">
        <div className="sf-account-locale-selector">
          {available.map((code) => {
            const label = getLocaleLabel(code, t);
            const selected = code === locale;

            return (
              <Button
                key={code}
                type="button"
                unstyled
                className={`sf-account-locale-pill${selected ? " sf-account-locale-pill--active" : ""}`}
                onClick={() => selectLocale(code)}
                title={label}
                ariaLabel={label}
              >
                <span
                  className="sf-account-locale-pill-flag"
                  aria-hidden="true"
                >
                  {getLocaleFlag(code)}
                </span>
                <span className="sf-account-locale-pill-label">{label}</span>
              </Button>
            );
          })}
        </div>
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
