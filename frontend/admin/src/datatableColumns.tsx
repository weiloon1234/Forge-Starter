import { Button } from "@shared/components";
import type { DataTableColumn } from "@shared/types/form";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";

type RowValue<T> = ReactNode | ((row: T) => ReactNode);
type RowText<T> = string | ((row: T) => string);

interface ActionColumnOptions<T> {
  label: RowText<T>;
  icon: RowValue<T>;
  onClick: (row: T) => void;
  className?: string;
}

function resolveRowValue<T>(value: RowValue<T>, row: T): ReactNode {
  return typeof value === "function" ? value(row) : value;
}

function resolveRowText<T>(value: RowText<T>, row: T): string {
  return typeof value === "function" ? value(row) : value;
}

export function actionColumn<T>({
  label,
  icon,
  onClick,
  className = "sf-datatable-action",
}: ActionColumnOptions<T>): DataTableColumn<T> {
  return {
    key: "__actions",
    label: "",
    render: (row) => {
      const text = resolveRowText(label, row);

      return (
        <Button
          type="button"
          unstyled
          className={className}
          ariaLabel={text}
          title={text}
          onClick={() => onClick(row)}
        >
          {resolveRowValue(icon, row)}
        </Button>
      );
    },
  };
}

export function createdAtColumn<T>(t: TFunction): DataTableColumn<T> {
  return {
    key: "created_at",
    label: t("Created"),
    sortable: true,
    format: "datetime",
  };
}
