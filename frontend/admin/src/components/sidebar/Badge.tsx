interface BadgeProps {
  count: number;
  className?: string;
}

export function Badge({ count, className }: BadgeProps) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  const base =
    "inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-xs font-medium rounded-full bg-[var(--color-danger)] text-white";
  return (
    <span
      role="status"
      className={className ? `${base} ${className}` : base}
      aria-label={`${label} pending`}
    >
      {label}
    </span>
  );
}
