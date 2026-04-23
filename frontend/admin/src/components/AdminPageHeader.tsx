import type { ReactNode } from "react";

interface AdminPageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}

export function AdminPageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: AdminPageHeaderProps) {
  return (
    <div className="sf-page-header">
      <div className={eyebrow ? "space-y-3" : undefined}>
        {eyebrow}

        <div>
          <h1 className="sf-page-title">{title}</h1>
          {subtitle ? <p className="sf-page-subtitle">{subtitle}</p> : null}
        </div>
      </div>

      {actions}
    </div>
  );
}
