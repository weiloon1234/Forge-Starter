import { createAuth } from "@shared/auth";
import type { UserResponse } from "@shared/types/generated";
import { api, USER_AUTH_TOKEN_KEY } from "./api";

export const auth = createAuth<UserResponse>({
  api,
  mode: "token",
  tokenKey: USER_AUTH_TOKEN_KEY,
  paths: {
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    me: "/me",
  },
});
