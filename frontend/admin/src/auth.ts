import { createAuth } from "@shared/auth";
import type { AdminMeResponse } from "@shared/types/generated";
import { ADMIN_AUTH_TOKEN_KEY, api } from "@/api";

export const auth = createAuth<AdminMeResponse>({
  api,
  mode: "token",
  tokenKey: ADMIN_AUTH_TOKEN_KEY,
  paths: {
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    me: "/auth/me",
  },
});
