import { createApi } from "@shared/api";
import { createRouteUrlBuilder, RouteIds } from "@shared/types/generated";

export const ADMIN_AUTH_TOKEN_KEY = "admin_auth_token";

export const api = createApi({
  baseURL: "/api/v1/admin",
  silentPaths: ["/auth/me", "/auth/refresh", "/auth/ws-token"],
  tokenKey: ADMIN_AUTH_TOKEN_KEY,
});

export const routeUrl = createRouteUrlBuilder({ basePath: "/api/v1/admin" });
export { RouteIds };

export const observabilityApi = createApi({
  baseURL: "",
  tokenKey: ADMIN_AUTH_TOKEN_KEY,
});
