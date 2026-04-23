import { DataTable } from "@shared/components";
import type { DataTableProps } from "@shared/types/form";
import type { ReactNode } from "react";
import { api } from "@/api";
import { AdminPageHeader } from "@/components/AdminPageHeader";

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
      <AdminPageHeader title={title} subtitle={subtitle} actions={action} />

      <div className="mt-4">
        <DataTable<T> api={api} defaultPerPage={20} {...datatable} />
      </div>
    </div>
  );
}
