import { cn, type StatusTone } from "@/observability/utils";

interface StatusBadgeProps {
  tone?: StatusTone;
  children: React.ReactNode;
}

export function StatusBadge({ tone = "neutral", children }: StatusBadgeProps) {
  return (
    <span className={cn("sf-obs-badge", `sf-obs-badge--${tone}`)}>
      {children}
    </span>
  );
}
