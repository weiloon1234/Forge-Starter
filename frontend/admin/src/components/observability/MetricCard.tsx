import { cn } from "@/observability/utils";

interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  accent?: "neutral" | "success" | "warning" | "danger";
}

export function MetricCard({
  label,
  value,
  detail,
  accent = "neutral",
}: MetricCardProps) {
  return (
    <section
      className={cn("sf-obs-metric-card", `sf-obs-metric-card--${accent}`)}
    >
      <p className="sf-obs-metric-card__label">{label}</p>
      <p className="sf-obs-metric-card__value">{value}</p>
      {detail && <p className="sf-obs-metric-card__detail">{detail}</p>}
    </section>
  );
}
