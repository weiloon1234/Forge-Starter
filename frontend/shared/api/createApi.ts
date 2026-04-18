import { localeStore } from "@shared/i18n/localeStore";
import axios, { type AxiosError, type AxiosInstance } from "axios";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────

interface ApiConfig {
  baseURL: string;
  /** URL paths that should never toast (auth probing endpoints). */
  silentPaths?: string[];
}

interface ApiErrorResponse {
  message: string;
  status: number;
  error_code?: string;
  message_key?: string;
  errors?: Array<{ field: string; code: string; message: string }>;
}

// ── ApiFormError (422) ─────────────────────────────────

export class ApiFormError extends Error {
  errors: Record<string, string[]>;

  constructor(response: ApiErrorResponse) {
    super(response.message);
    this.name = "ApiFormError";
    this.errors = transformFieldErrors(response.errors ?? []);
  }
}

function transformFieldErrors(
  errors: Array<{ field: string; message: string }>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const err of errors) {
    if (!result[err.field]) result[err.field] = [];
    result[err.field].push(err.message);
  }
  return result;
}

// ── Auth token ─────────────────────────────────────────

const TOKEN_KEY = "auth_token";

export function setToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // SSR or no localStorage
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// ── Factory ────────────────────────────────────────────

export function createApi({
  baseURL,
  silentPaths = [],
}: ApiConfig): AxiosInstance {
  const instance = axios.create({
    baseURL,
    headers: { Accept: "application/json" },
  });

  // Request interceptor: attach auth token + locale
  instance.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers["Accept-Language"] = localeStore.locale;
    return config;
  });

  // Response interceptor: handle errors + auto-toast
  instance.interceptors.response.use(
    (res) => res,
    (error: AxiosError<ApiErrorResponse>) => {
      const data = error.response?.data;
      const status = error.response?.status;
      const url = error.config?.url || "";

      // 422 Validation — toast + structured field errors
      if (status === 422 && data?.errors) {
        toast.error(data.message || "Validation failed");
        return Promise.reject(new ApiFormError(data));
      }

      // Silent paths (auth probing: /me, /refresh) — no toast
      const isSilent = silentPaths.some((p) => url === p || url.endsWith(p));
      if (isSilent) {
        return Promise.reject(error);
      }

      // All other errors — toast the message
      if (data?.message) {
        toast.error(data.message);
      } else {
        toast.error("Something went wrong");
      }

      return Promise.reject(error);
    },
  );

  return instance;
}
