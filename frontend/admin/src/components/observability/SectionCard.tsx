interface SectionCardProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
}: SectionCardProps) {
  return (
    <section className="sf-obs-section-card">
      <header className="sf-obs-section-card__header">
        <div>
          <h2 className="sf-obs-section-card__title">{title}</h2>
          {subtitle && (
            <p className="sf-obs-section-card__subtitle">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="sf-obs-section-card__actions">{actions}</div>
        )}
      </header>
      <div className="sf-obs-section-card__body">{children}</div>
    </section>
  );
}
