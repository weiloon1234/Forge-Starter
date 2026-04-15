import { createAuth } from "@shared/auth";
import { api } from "@/api";
import type { AdminMeResponse } from "@shared/types/generated";

export const auth = createAuth<AdminMeResponse>({
  api,
  mode: "session",
  paths: {
    login: "/auth/login",
    logout: "/auth/logout",
    me: "/auth/me",
  },
});
