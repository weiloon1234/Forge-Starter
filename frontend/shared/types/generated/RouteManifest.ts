// Auto-generated from Forge routes. Do not edit.

export type RouteParamValue = string | number | boolean;
export type RouteUrlOptions = { basePath?: string };
type RouteManifestRuntimeEntry = { readonly path: string; readonly params: readonly string[] };

export const RouteManifest = {
  "admin.admins.destroy": { id: "admin.admins.destroy", path: "/api/v1/admin/admins/{id}", method: "delete", params: ["id"], guard: "admin", permissions: ["admins.manage"], summary: "Delete admin", request: null, responses: [{ status: 200, schema: "MessageResponse" }] },
  "admin.admins.index": { id: "admin.admins.index", path: "/api/v1/admin/admins", method: "get", params: [], guard: "admin", permissions: ["admins.read"], summary: "List admins (paginated)", request: null, responses: [] },
  "admin.admins.permissions": { id: "admin.admins.permissions", path: "/api/v1/admin/admins/permissions", method: "get", params: [], guard: "admin", permissions: ["admins.read"], summary: "List grantable permissions for the current admin", request: null, responses: [{ status: 200, schema: "Array" }] },
  "admin.admins.show": { id: "admin.admins.show", path: "/api/v1/admin/admins/{id}", method: "get", params: ["id"], guard: "admin", permissions: ["admins.read"], summary: "Get admin by ID", request: null, responses: [{ status: 200, schema: "AdminResponse" }] },
  "admin.admins.store": { id: "admin.admins.store", path: "/api/v1/admin/admins", method: "post", params: [], guard: "admin", permissions: ["admins.manage"], summary: "Create admin", request: "CreateAdminRequest", responses: [{ status: 201, schema: "AdminResponse" }] },
  "admin.admins.update": { id: "admin.admins.update", path: "/api/v1/admin/admins/{id}", method: "put", params: ["id"], guard: "admin", permissions: ["admins.manage"], summary: "Update admin", request: "UpdateAdminRequest", responses: [{ status: 200, schema: "AdminResponse" }] },
  "admin.auth.login": { id: "admin.auth.login", path: "/api/v1/admin/auth/login", method: "post", params: [], guard: null, permissions: [], summary: "Admin login (token)", request: "AdminLoginRequest", responses: [{ status: 200, schema: "TokenPair" }] },
  "admin.auth.logout": { id: "admin.auth.logout", path: "/api/v1/admin/auth/logout", method: "post", params: [], guard: "admin", permissions: [], summary: "Admin logout", request: null, responses: [{ status: 200, schema: "MessageResponse" }] },
  "admin.auth.me": { id: "admin.auth.me", path: "/api/v1/admin/auth/me", method: "get", params: [], guard: "admin", permissions: [], summary: "Get authenticated admin profile", request: null, responses: [{ status: 200, schema: "AdminMeResponse" }] },
  "admin.auth.refresh": { id: "admin.auth.refresh", path: "/api/v1/admin/auth/refresh", method: "post", params: [], guard: null, permissions: [], summary: "Refresh admin access token", request: "RefreshTokenRequest", responses: [{ status: 200, schema: "TokenPair" }] },
  "admin.auth.ws_token": { id: "admin.auth.ws_token", path: "/api/v1/admin/auth/ws-token", method: "post", params: [], guard: "admin", permissions: [], summary: "Get short-lived WebSocket token", request: null, responses: [{ status: 200, schema: "WsTokenResponse" }] },
  "admin.badges.index": { id: "admin.badges.index", path: "/api/v1/admin/badges", method: "get", params: [], guard: "admin", permissions: [], summary: "Current admin badge counts", request: null, responses: [{ status: 200, schema: "BadgeCountsResponse" }] },
  "admin.banks.destroy": { id: "admin.banks.destroy", path: "/api/v1/admin/banks/{id}", method: "delete", params: ["id"], guard: "admin", permissions: ["banks.manage", "banks.read"], summary: "Delete bank", request: null, responses: [{ status: 200, schema: "MessageResponse" }] },
  "admin.banks.options": { id: "admin.banks.options", path: "/api/v1/admin/banks/options", method: "get", params: [], guard: "admin", permissions: ["banks.read"], summary: "List bank options", request: null, responses: [{ status: 200, schema: "Array" }] },
  "admin.banks.show": { id: "admin.banks.show", path: "/api/v1/admin/banks/{id}", method: "get", params: ["id"], guard: "admin", permissions: ["banks.read"], summary: "Get bank detail", request: null, responses: [{ status: 200, schema: "AdminBankResponse" }] },
  "admin.banks.store": { id: "admin.banks.store", path: "/api/v1/admin/banks", method: "post", params: [], guard: "admin", permissions: ["banks.manage", "banks.read"], summary: "Create bank", request: "UpsertBankRequest", responses: [{ status: 200, schema: "AdminBankResponse" }] },
  "admin.banks.update": { id: "admin.banks.update", path: "/api/v1/admin/banks/{id}", method: "put", params: ["id"], guard: "admin", permissions: ["banks.manage", "banks.read"], summary: "Update bank", request: "UpsertBankRequest", responses: [{ status: 200, schema: "AdminBankResponse" }] },
  "admin.countries.update": { id: "admin.countries.update", path: "/api/v1/admin/countries/{iso2}", method: "put", params: ["iso2"], guard: "admin", permissions: ["countries.manage"], summary: "Update country", request: "UpdateCountryRequest", responses: [{ status: 200, schema: "MessageResponse" }] },
  "admin.credits.adjustments.store": { id: "admin.credits.adjustments.store", path: "/api/v1/admin/credits/adjustments", method: "post", params: [], guard: "admin", permissions: ["credits.manage", "credits.read"], summary: "Create a manual admin credit adjustment", request: "CreateAdminCreditAdjustmentRequest", responses: [{ status: 201, schema: "AdminCreditAdjustmentResponse" }] },
  "admin.credits.user_options": { id: "admin.credits.user_options", path: "/api/v1/admin/credits/users/options", method: "get", params: [], guard: "admin", permissions: ["credits.manage", "credits.read"], summary: "Search users for credit adjustment selection", request: null, responses: [{ status: 200, schema: "Array" }] },
  "admin.datatables.download": { id: "admin.datatables.download", path: "/api/v1/admin/datatables/{id}/download", method: "get", params: ["id"], guard: "admin", permissions: [], summary: "Download datatable as XLSX", request: null, responses: [] },
  "admin.datatables.query": { id: "admin.datatables.query", path: "/api/v1/admin/datatables/{id}/query", method: "get", params: ["id"], guard: "admin", permissions: [], summary: "Query datatable", request: null, responses: [] },
  "admin.editor_assets.upload": { id: "admin.editor_assets.upload", path: "/api/v1/admin/editor-assets/upload", method: "post", params: [], guard: "admin", permissions: [], summary: "Upload a Froala editor file or image", request: null, responses: [{ status: 200, schema: "AdminEditorAssetUploadResponse" }] },
  "admin.logs.destroy": { id: "admin.logs.destroy", path: "/api/v1/admin/logs/{filename}", method: "delete", params: ["filename"], guard: "admin", permissions: ["logs.manage", "logs.read"], summary: "Delete a log file", request: null, responses: [{ status: 200, schema: "MessageResponse" }] },
  "admin.logs.index": { id: "admin.logs.index", path: "/api/v1/admin/logs", method: "get", params: [], guard: "admin", permissions: ["logs.read"], summary: "List log files", request: null, responses: [{ status: 200, schema: "Array" }] },
  "admin.logs.show": { id: "admin.logs.show", path: "/api/v1/admin/logs/{filename}", method: "get", params: ["filename"], guard: "admin", permissions: ["logs.read"], summary: "Read tail of a log file", request: null, responses: [{ status: 200, schema: "Array" }] },
  "admin.pages.delete_cover": { id: "admin.pages.delete_cover", path: "/api/v1/admin/pages/{id}/cover", method: "delete", params: ["id"], guard: "admin", permissions: ["pages.manage", "pages.read"], summary: "Delete page cover", request: null, responses: [{ status: 200, schema: "AdminPageResponse" }] },
  "admin.pages.destroy": { id: "admin.pages.destroy", path: "/api/v1/admin/pages/{id}", method: "delete", params: ["id"], guard: "admin", permissions: ["pages.manage", "pages.read"], summary: "Delete page", request: null, responses: [{ status: 200, schema: "MessageResponse" }] },
  "admin.pages.show": { id: "admin.pages.show", path: "/api/v1/admin/pages/{id}", method: "get", params: ["id"], guard: "admin", permissions: ["pages.read"], summary: "Get page detail for editing", request: null, responses: [{ status: 200, schema: "AdminPageResponse" }] },
  "admin.pages.store": { id: "admin.pages.store", path: "/api/v1/admin/pages", method: "post", params: [], guard: "admin", permissions: ["pages.manage", "pages.read"], summary: "Create page", request: "CreatePageRequest", responses: [{ status: 200, schema: "AdminPageResponse" }] },
  "admin.pages.update": { id: "admin.pages.update", path: "/api/v1/admin/pages/{id}", method: "put", params: ["id"], guard: "admin", permissions: ["pages.manage", "pages.read"], summary: "Update page", request: "UpdatePageRequest", responses: [{ status: 200, schema: "AdminPageResponse" }] },
  "admin.pages.upload_cover": { id: "admin.pages.upload_cover", path: "/api/v1/admin/pages/{id}/cover", method: "post", params: ["id"], guard: "admin", permissions: ["pages.manage", "pages.read"], summary: "Upload or replace page cover", request: null, responses: [{ status: 200, schema: "AdminPageResponse" }] },
  "admin.profile.change_password": { id: "admin.profile.change_password", path: "/api/v1/admin/profile/password", method: "put", params: [], guard: "admin", permissions: [], summary: "Change admin password", request: "ChangeAdminPasswordRequest", responses: [{ status: 200, schema: "MessageResponse" }] },
  "admin.profile.locale": { id: "admin.profile.locale", path: "/api/v1/admin/profile/locale", method: "put", params: [], guard: "admin", permissions: [], summary: "Update admin locale preference", request: "UpdateAdminLocaleRequest", responses: [{ status: 200, schema: "MessageResponse" }] },
  "admin.profile.update": { id: "admin.profile.update", path: "/api/v1/admin/profile", method: "put", params: [], guard: "admin", permissions: [], summary: "Update admin profile", request: "UpdateAdminProfileRequest", responses: [{ status: 200, schema: "AdminMeResponse" }] },
  "admin.settings.show": { id: "admin.settings.show", path: "/api/v1/admin/settings/{key}", method: "get", params: ["key"], guard: "admin", permissions: ["settings.read"], summary: "Get setting detail for editing", request: null, responses: [{ status: 200, schema: "AdminSettingResponse" }] },
  "admin.settings.update": { id: "admin.settings.update", path: "/api/v1/admin/settings/{key}", method: "put", params: ["key"], guard: "admin", permissions: ["settings.manage", "settings.read"], summary: "Update a setting value", request: "UpdateSettingValueRequest", responses: [{ status: 200, schema: "AdminSettingResponse" }] },
  "admin.settings.upload": { id: "admin.settings.upload", path: "/api/v1/admin/settings/{key}/upload", method: "post", params: ["key"], guard: "admin", permissions: ["settings.manage", "settings.read"], summary: "Upload and replace a file/image setting value", request: null, responses: [{ status: 200, schema: "AdminSettingResponse" }] },
  "admin.users.index": { id: "admin.users.index", path: "/api/v1/admin/users", method: "get", params: [], guard: "admin", permissions: ["users.read"], summary: "List users (paginated)", request: null, responses: [] },
  "admin.users.introducer_changes_store": { id: "admin.users.introducer_changes_store", path: "/api/v1/admin/users/{id}/introducer-changes", method: "post", params: ["id"], guard: "admin", permissions: ["introducer_changes.manage", "users.read"], summary: "Change a user's introducer and write an admin audit trail", request: "ChangeUserIntroducerRequest", responses: [{ status: 201, schema: "AdminUserIntroducerChangeResponse" }] },
  "admin.users.options": { id: "admin.users.options", path: "/api/v1/admin/users/options", method: "get", params: [], guard: "admin", permissions: ["introducer_changes.manage", "users.read"], summary: "Search users for introducer change selection", request: null, responses: [{ status: 200, schema: "Array" }] },
  "admin.users.show": { id: "admin.users.show", path: "/api/v1/admin/users/{id}", method: "get", params: ["id"], guard: "admin", permissions: ["users.read"], summary: "Get user by ID", request: null, responses: [{ status: 200, schema: "AdminUserResponse" }] },
  "admin.users.store": { id: "admin.users.store", path: "/api/v1/admin/users", method: "post", params: [], guard: "admin", permissions: ["users.manage", "users.read"], summary: "Create user", request: "CreateUserRequest", responses: [{ status: 201, schema: "AdminUserResponse" }] },
  "admin.users.update": { id: "admin.users.update", path: "/api/v1/admin/users/{id}", method: "put", params: ["id"], guard: "admin", permissions: ["users.manage", "users.read"], summary: "Update user", request: "UpdateUserRequest", responses: [{ status: 200, schema: "AdminUserResponse" }] },
  "user.auth.login": { id: "user.auth.login", path: "/api/v1/user/auth/login", method: "post", params: [], guard: null, permissions: [], summary: "User login (token)", request: "LoginRequest", responses: [{ status: 200, schema: "TokenPair" }] },
  "user.auth.refresh": { id: "user.auth.refresh", path: "/api/v1/user/auth/refresh", method: "post", params: [], guard: null, permissions: [], summary: "Refresh access token", request: "RefreshTokenRequest", responses: [{ status: 200, schema: "TokenPair" }] },
  "user.me.show": { id: "user.me.show", path: "/api/v1/user/me", method: "get", params: [], guard: "user", permissions: [], summary: "Get authenticated user profile", request: null, responses: [{ status: 200, schema: "UserResponse" }] },
  "user.me.update": { id: "user.me.update", path: "/api/v1/user/me", method: "put", params: [], guard: "user", permissions: [], summary: "Update user profile", request: "UpdateProfileRequest", responses: [{ status: 200, schema: "UserResponse" }] }
} as const;

export const RouteIds = {
  admin: {
    admins: {
      destroy: "admin.admins.destroy",
      index: "admin.admins.index",
      permissions: "admin.admins.permissions",
      show: "admin.admins.show",
      store: "admin.admins.store",
      update: "admin.admins.update",
    },
    auth: {
      login: "admin.auth.login",
      logout: "admin.auth.logout",
      me: "admin.auth.me",
      refresh: "admin.auth.refresh",
      wsToken: "admin.auth.ws_token",
    },
    badges: {
      index: "admin.badges.index",
    },
    banks: {
      destroy: "admin.banks.destroy",
      options: "admin.banks.options",
      show: "admin.banks.show",
      store: "admin.banks.store",
      update: "admin.banks.update",
    },
    countries: {
      update: "admin.countries.update",
    },
    credits: {
      adjustments: {
        store: "admin.credits.adjustments.store",
      },
      userOptions: "admin.credits.user_options",
    },
    datatables: {
      download: "admin.datatables.download",
      query: "admin.datatables.query",
    },
    editorAssets: {
      upload: "admin.editor_assets.upload",
    },
    logs: {
      destroy: "admin.logs.destroy",
      index: "admin.logs.index",
      show: "admin.logs.show",
    },
    pages: {
      deleteCover: "admin.pages.delete_cover",
      destroy: "admin.pages.destroy",
      show: "admin.pages.show",
      store: "admin.pages.store",
      update: "admin.pages.update",
      uploadCover: "admin.pages.upload_cover",
    },
    profile: {
      changePassword: "admin.profile.change_password",
      locale: "admin.profile.locale",
      update: "admin.profile.update",
    },
    settings: {
      show: "admin.settings.show",
      update: "admin.settings.update",
      upload: "admin.settings.upload",
    },
    users: {
      index: "admin.users.index",
      introducerChangesStore: "admin.users.introducer_changes_store",
      options: "admin.users.options",
      show: "admin.users.show",
      store: "admin.users.store",
      update: "admin.users.update",
    },
  },
  user: {
    auth: {
      login: "user.auth.login",
      refresh: "user.auth.refresh",
    },
    me: {
      show: "user.me.show",
      update: "user.me.update",
    },
  },
} as const;

export type RouteName = keyof typeof RouteManifest;
export type RouteParams = {
  "admin.admins.destroy": { "id": RouteParamValue };
  "admin.admins.index": Record<never, never>;
  "admin.admins.permissions": Record<never, never>;
  "admin.admins.show": { "id": RouteParamValue };
  "admin.admins.store": Record<never, never>;
  "admin.admins.update": { "id": RouteParamValue };
  "admin.auth.login": Record<never, never>;
  "admin.auth.logout": Record<never, never>;
  "admin.auth.me": Record<never, never>;
  "admin.auth.refresh": Record<never, never>;
  "admin.auth.ws_token": Record<never, never>;
  "admin.badges.index": Record<never, never>;
  "admin.banks.destroy": { "id": RouteParamValue };
  "admin.banks.options": Record<never, never>;
  "admin.banks.show": { "id": RouteParamValue };
  "admin.banks.store": Record<never, never>;
  "admin.banks.update": { "id": RouteParamValue };
  "admin.countries.update": { "iso2": RouteParamValue };
  "admin.credits.adjustments.store": Record<never, never>;
  "admin.credits.user_options": Record<never, never>;
  "admin.datatables.download": { "id": RouteParamValue };
  "admin.datatables.query": { "id": RouteParamValue };
  "admin.editor_assets.upload": Record<never, never>;
  "admin.logs.destroy": { "filename": RouteParamValue };
  "admin.logs.index": Record<never, never>;
  "admin.logs.show": { "filename": RouteParamValue };
  "admin.pages.delete_cover": { "id": RouteParamValue };
  "admin.pages.destroy": { "id": RouteParamValue };
  "admin.pages.show": { "id": RouteParamValue };
  "admin.pages.store": Record<never, never>;
  "admin.pages.update": { "id": RouteParamValue };
  "admin.pages.upload_cover": { "id": RouteParamValue };
  "admin.profile.change_password": Record<never, never>;
  "admin.profile.locale": Record<never, never>;
  "admin.profile.update": Record<never, never>;
  "admin.settings.show": { "key": RouteParamValue };
  "admin.settings.update": { "key": RouteParamValue };
  "admin.settings.upload": { "key": RouteParamValue };
  "admin.users.index": Record<never, never>;
  "admin.users.introducer_changes_store": { "id": RouteParamValue };
  "admin.users.options": Record<never, never>;
  "admin.users.show": { "id": RouteParamValue };
  "admin.users.store": Record<never, never>;
  "admin.users.update": { "id": RouteParamValue };
  "user.auth.login": Record<never, never>;
  "user.auth.refresh": Record<never, never>;
  "user.me.show": Record<never, never>;
  "user.me.update": Record<never, never>;
};

type RouteArgs<Name extends RouteName> = Name extends RouteName
? keyof RouteParams[Name] extends never
? [params?: RouteParams[Name], options?: RouteUrlOptions]
: [params: RouteParams[Name], options?: RouteUrlOptions]
: never;

function replaceAll(input: string, search: string, value: string): string {
return input.split(search).join(value);
}

function normalizeBasePath(basePath: string | undefined): string {
if (!basePath || basePath === "/") {
return "";
}
const normalized = basePath.startsWith("/") ? basePath : `/${basePath}`;
return normalized.replace(/\/+$/, "");
}

function stripBasePath(path: string, basePath: string | undefined): string {
const normalized = normalizeBasePath(basePath);
if (!normalized) {
return path;
}
if (path === normalized) {
return "/";
}
if (path.startsWith(`${normalized}/`)) {
return path.slice(normalized.length);
}
return path;
}

function substituteRouteParams(
name: RouteName,
entry: RouteManifestRuntimeEntry,
params: Record<string, RouteParamValue>,
): string {
let path = entry.path;
for (const param of entry.params) {
if (!Object.prototype.hasOwnProperty.call(params, param)) {
throw new Error(`Route ${String(name)} is missing required parameter ${param}`);
}
const value = encodeURIComponent(String(params[param]));
path = replaceAll(path, `{${param}}`, value);
path = replaceAll(path, `{*${param}}`, value);
path = replaceAll(path, `:${param}`, value);
}
return path;
}

function resolveRouteUrl(
name: RouteName,
params: Record<string, RouteParamValue>,
options: RouteUrlOptions,
): string {
const entry = RouteManifest[name] as RouteManifestRuntimeEntry | undefined;
if (!entry) {
throw new Error(`Unknown route ${String(name)}`);
}
return stripBasePath(substituteRouteParams(name, entry, params), options.basePath);
}

export function routeUrl<Name extends RouteName>(
name: Name,
...args: RouteArgs<Name>
): string {
const params = (args[0] ?? {}) as Record<string, RouteParamValue>;
const options = (args[1] ?? {}) as RouteUrlOptions;
return resolveRouteUrl(name, params, options);
}

export function createRouteUrlBuilder(options: RouteUrlOptions) {
return function buildRouteUrl<Name extends RouteName>(
name: Name,
...args: RouteArgs<Name>
): string {
const params = (args[0] ?? {}) as Record<string, RouteParamValue>;
const routeOptions = (args[1] ?? {}) as RouteUrlOptions;
return resolveRouteUrl(name, params, { ...options, ...routeOptions });
};
}
