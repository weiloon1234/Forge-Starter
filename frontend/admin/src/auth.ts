import { createAuth } from "@shared/auth";
import type { AdminMeResponse } from "@shared/types/generated";
import { api } from "@/api";

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
