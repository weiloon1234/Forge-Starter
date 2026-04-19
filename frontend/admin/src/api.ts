import { createApi } from "@shared/api";

export const api = createApi({
  baseURL: "/api/v1/admin",
  silentPaths: ["/auth/me", "/auth/refresh"],
});

export const observabilityApi = createApi({
  baseURL: "",
});
