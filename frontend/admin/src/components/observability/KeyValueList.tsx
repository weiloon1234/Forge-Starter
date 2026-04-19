interface KeyValueListProps {
  items: Array<{
    key: string;
    label: string;
    value: React.ReactNode;
  }>;
}

export function KeyValueList({ items }: KeyValueListProps) {
  return (
    <dl className="sf-obs-key-value-list">
      {items.map((item) => (
        <div key={item.key} className="sf-obs-key-value-list__row">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
