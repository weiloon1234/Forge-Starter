import { cn } from "@/observability/utils";

export interface ObservabilityColumn<T> {
  key: string;
  label: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: ObservabilityColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: React.ReactNode;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  onRowClick,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <div className="sf-obs-table-empty">{empty}</div>;
  }

  return (
    <div className="sf-obs-table-shell">
      <table className="sf-obs-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  column.align === "right" && "sf-obs-table__cell--right",
                  column.className,
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const interactive = Boolean(onRowClick);

            return (
              <tr
                key={rowKey(row)}
                className={cn(interactive && "sf-obs-table__row--interactive")}
                onClick={interactive ? () => onRowClick?.(row) : undefined}
                onKeyDown={
                  interactive
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick?.(row);
                        }
                      }
                    : undefined
                }
                tabIndex={interactive ? 0 : undefined}
                role={interactive ? "button" : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      column.align === "right" && "sf-obs-table__cell--right",
                      column.className,
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
