import { createAuth } from "@shared/auth";
import type { UserResponse } from "@shared/types/generated";
import { api } from "./api";

export const auth = createAuth<UserResponse>({
  api,
  mode: "token",
  paths: {
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    me: "/me",
  },
});
