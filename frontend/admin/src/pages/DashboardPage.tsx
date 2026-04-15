import { useTranslation } from "react-i18next";

export function DashboardPage() {
  const { t } = useTranslation();

  return (
    <div>
      <h1 className="sf-page-title">{t("Dashboard")}</h1>
    </div>
  );
}
