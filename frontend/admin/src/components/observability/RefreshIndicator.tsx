import { Button } from "@shared/components";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/observability/utils";

interface RefreshIndicatorProps {
  lastUpdated: number | null;
  refreshing: boolean;
  paused?: boolean;
  onRefresh: () => void;
}

export function RefreshIndicator({
  lastUpdated,
  refreshing,
  paused = false,
  onRefresh,
}: RefreshIndicatorProps) {
  const { t } = useTranslation();

  return (
    <div className="sf-obs-refresh-indicator">
      <span className="sf-obs-refresh-indicator__text">
        {lastUpdated
          ? t("observability.common.last_refreshed", {
              time: formatDateTime(lastUpdated),
            })
          : t("Loading")}
      </span>
      {paused && (
        <span className="sf-obs-refresh-indicator__paused">
          {t("observability.common.live_paused")}
        </span>
      )}
      <Button
        variant="secondary"
        size="sm"
        busy={refreshing}
        onClick={onRefresh}
      >
        {t("observability.common.refresh_now")}
      </Button>
    </div>
  );
}
