import type { AdminUserLookupOptionResponse } from "@shared/types/generated";

export function userOptionLabel(user: AdminUserLookupOptionResponse): string {
  return user.subtitle ? `${user.label} · ${user.subtitle}` : user.label;
}
