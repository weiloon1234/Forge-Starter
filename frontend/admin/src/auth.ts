import { createAuth } from "@shared/auth";
import { api } from "@/api";
import type { AdminMeResponse } from "@shared/types/generated";

export const auth = createAuth<AdminMeResponse>({
  api,
  mode: "token",
  paths: {
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    me: "/auth/me",
  },
});
