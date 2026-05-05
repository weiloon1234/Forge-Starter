import { createAuth } from "@shared/auth";
import type { AdminMeResponse } from "@shared/types/generated";
import { ADMIN_AUTH_TOKEN_KEY, api, RouteIds, routeUrl } from "@/api";

export const auth = createAuth<AdminMeResponse>({
  api,
  mode: "token",
  tokenKey: ADMIN_AUTH_TOKEN_KEY,
  paths: {
    login: routeUrl(RouteIds.admin.auth.login),
    refresh: routeUrl(RouteIds.admin.auth.refresh),
    logout: routeUrl(RouteIds.admin.auth.logout),
    me: routeUrl(RouteIds.admin.auth.me),
  },
});
