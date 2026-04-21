import type { AdminUserLookupOptionResponse } from "@shared/types/generated";

export function userOptionLabel(user: AdminUserLookupOptionResponse): string {
  return user.subtitle ? `${user.label} · ${user.subtitle}` : user.label;
}

export function mergeUserOptions(
  users: AdminUserLookupOptionResponse[],
  selectedUser: AdminUserLookupOptionResponse | null,
): AdminUserLookupOptionResponse[] {
  if (!selectedUser) {
    return users;
  }

  return users.some((user) => user.id === selectedUser.id)
    ? users
    : [selectedUser, ...users];
}
