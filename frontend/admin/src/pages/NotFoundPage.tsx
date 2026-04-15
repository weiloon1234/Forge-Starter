import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@shared/components";

export function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="sf-status-page">
      <div className="sf-status-code">404</div>
      <h1 className="sf-status-title">{t("Page not found")}</h1>
      <p className="sf-status-desc">{t("page_not_found_desc")}</p>
      <Button variant="secondary" size="sm" onClick={() => navigate("/")}>
        <ArrowLeft size={16} />
        {t("Back to dashboard")}
      </Button>
    </div>
  );
}
