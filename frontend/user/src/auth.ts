import { createAuth } from "@shared/auth";
import { api } from "./api";
import type { UserResponse } from "@shared/types/generated";

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
