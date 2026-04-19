import { Button } from "@shared/components";
import { useTranslation } from "react-i18next";

interface ErrorStateProps {
  title: string;
  description?: string | null;
  onRetry?: () => void;
}

export function ErrorState({ title, description, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();

  return (
    <div className="sf-obs-error-state">
      <p className="sf-obs-error-state__title">{title}</p>
      {description && (
        <p className="sf-obs-error-state__description">{description}</p>
      )}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t("observability.common.refresh_now")}
        </Button>
      )}
    </div>
  );
}
