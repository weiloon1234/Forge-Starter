import { Button, Input } from "@shared/components";
import { useForm } from "@shared/hooks";
import type { AdminLoginRequest } from "@shared/types/generated";
import { Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { auth } from "@/auth";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

export function LoginPage() {
  const { t } = useTranslation();

  const form = useForm<AdminLoginRequest>({
    initialValues: { username: "", password: "" },
    onSubmit: async (values) => {
      await auth.login(values);
    },
  });

  return (
    <div className="sf-login-page">
      <div className="sf-login-brand">
        <div className="sf-login-brand-inner">
          <div className="sf-login-brand-icon">
            <Shield size={28} />
          </div>
          <h1 className="sf-login-brand-title">{t("Admin Portal")}</h1>
          <p className="sf-login-brand-desc">{t("login_brand_desc")}</p>
        </div>
      </div>

      <div className="sf-login-main">
        <div className="sf-login-topbar">
          <div className="sf-login-mobile-header">
            <div className="sf-login-brand-icon">
              <Shield size={22} />
            </div>
            <span className="sf-login-mobile-title">{t("Admin Portal")}</span>
          </div>
          <LocaleSwitcher className="sf-login-locale" />
        </div>

        <div className="sf-login-card">
          <h2 className="sf-login-title">{t("Log in")}</h2>
          <p className="sf-login-subtitle">{t("login_subtitle")}</p>

          <form onSubmit={form.handleSubmit} className="sf-login-form">
            <Input
              {...form.field("username")}
              type="text"
              label={t("Username")}
              placeholder={t("Username")}
              autoFocus
            />
            <Input
              {...form.field("password")}
              type="password"
              label={t("Password")}
              placeholder={t("Password")}
            />
            <Button type="submit" variant="primary" fullWidth busy={form.busy}>
              {t("Log in")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
