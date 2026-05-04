import { createApi } from "@shared/api";

export const USER_AUTH_TOKEN_KEY = "user_auth_token";

export const api = createApi({
  baseURL: "/api/v1/user",
  silentPaths: ["/me", "/auth/refresh"],
  tokenKey: USER_AUTH_TOKEN_KEY,
});
