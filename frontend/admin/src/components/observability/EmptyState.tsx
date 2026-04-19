interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="sf-obs-empty-state">
      <p className="sf-obs-empty-state__title">{title}</p>
      {description && (
        <p className="sf-obs-empty-state__description">{description}</p>
      )}
    </div>
  );
}
