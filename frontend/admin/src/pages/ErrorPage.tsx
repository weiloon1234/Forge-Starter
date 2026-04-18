import { Button } from "@shared/components";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  isRouteErrorResponse,
  useNavigate,
  useRouteError,
} from "react-router-dom";

export function ErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();
  const navigate = useNavigate();

  const status = isRouteErrorResponse(error) ? error.status : 500;
  const message = isRouteErrorResponse(error)
    ? error.statusText || t("error.something_went_wrong")
    : t("error.something_went_wrong");

  return (
    <div className="sf-status-page sf-status-page--fullscreen">
      <div className="sf-status-icon">
        <TriangleAlert size={32} />
      </div>
      <div className="sf-status-code">{status}</div>
      <h1 className="sf-status-title">{message}</h1>
      <p className="sf-status-desc">{t("error_page_desc")}</p>
      <Button variant="secondary" size="sm" onClick={() => navigate("/")}>
        <ArrowLeft size={16} />
        {t("Back to dashboard")}
      </Button>
    </div>
  );
}
