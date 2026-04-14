import { createAuth } from "@shared/auth";
import { api } from "./api";
import type { AdminUserResponse } from "@shared/types/generated";

export const auth = createAuth<AdminUserResponse>({
  api,
  mode: "session",
  paths: {
    login: "/auth/login",
    logout: "/auth/logout",
    me: "/auth/me",
  },
});
