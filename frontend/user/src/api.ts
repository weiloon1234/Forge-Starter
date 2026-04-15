import { createApi } from "@shared/api";

export const api = createApi({
  baseURL: "/api/v1/user",
  silentPaths: ["/me", "/auth/refresh"],
});
