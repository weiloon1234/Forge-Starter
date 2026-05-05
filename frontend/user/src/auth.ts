import { createAuth } from "@shared/auth";
import type { UserResponse } from "@shared/types/generated";
import { api, RouteIds, routeUrl, USER_AUTH_TOKEN_KEY } from "./api";

export const auth = createAuth<UserResponse>({
  api,
  mode: "token",
  tokenKey: USER_AUTH_TOKEN_KEY,
  paths: {
    login: routeUrl(RouteIds.user.auth.login),
    refresh: routeUrl(RouteIds.user.auth.refresh),
    logout: "/auth/logout",
    me: routeUrl(RouteIds.user.me.show),
  },
});
