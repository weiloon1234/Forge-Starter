import type { Permission } from "@shared/types/generated";

function permission<T extends Permission>(value: T): T {
  return value;
}

export const permissions = {
  admins: {
    read: permission("admins.read"),
    manage: permission("admins.manage"),
  },
  auditLogs: {
    read: permission("audit_logs.read"),
  },
  countries: {
    read: permission("countries.read"),
    manage: permission("countries.manage"),
  },
  credits: {
    read: permission("credits.read"),
    manage: permission("credits.manage"),
  },
  creditTransactions: {
    read: permission("credit_transactions.read"),
  },
  exports: {
    read: permission("exports.read"),
  },
  introducerChanges: {
    read: permission("introducer_changes.read"),
    manage: permission("introducer_changes.manage"),
  },
  logs: {
    manage: permission("logs.manage"),
  },
  pages: {
    read: permission("pages.read"),
    manage: permission("pages.manage"),
  },
  settings: {
    read: permission("settings.read"),
    manage: permission("settings.manage"),
  },
  users: {
    read: permission("users.read"),
    manage: permission("users.manage"),
  },
} as const;
