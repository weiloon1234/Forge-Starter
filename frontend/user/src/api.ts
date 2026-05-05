import { createApi } from "@shared/api";
import { createRouteUrlBuilder, RouteIds } from "@shared/types/generated";

export const USER_AUTH_TOKEN_KEY = "user_auth_token";

export const api = createApi({
  baseURL: "/api/v1/user",
  silentPaths: ["/me", "/auth/refresh"],
  tokenKey: USER_AUTH_TOKEN_KEY,
});

export const routeUrl = createRouteUrlBuilder({ basePath: "/api/v1/user" });
export { RouteIds };
