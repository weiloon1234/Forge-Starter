import { DataTable } from "@shared/components";
import type { DataTableProps } from "@shared/types/form";
import type { ReactNode } from "react";
import { api } from "@/api";

interface AdminDatatablePageProps<T> {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  datatable: Omit<DataTableProps<T>, "defaultPerPage">;
}

export function AdminDatatablePage<T>({
  title,
  subtitle,
  action,
  datatable,
}: AdminDatatablePageProps<T>) {
  return (
    <div>
      <div className="sf-page-header">
        <div>
          <h1 className="sf-page-title">{title}</h1>
          {subtitle && <p className="sf-page-subtitle">{subtitle}</p>}
        </div>

        {action}
      </div>

      <div className="mt-4">
        <DataTable<T> api={api} defaultPerPage={20} {...datatable} />
      </div>
    </div>
  );
}
