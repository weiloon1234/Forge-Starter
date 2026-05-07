import { localeStore } from "@shared/i18n/localeStore";
import { toast } from "@shared/toast";
import { getBrowserTimezone } from "@shared/utils";
import axios, { type AxiosError, type AxiosInstance } from "axios";

// ── Types ──────────────────────────────────────────────

interface ApiConfig {
  baseURL: string;
  /** URL paths that should never toast (auth probing/background endpoints). */
  silentPaths?: string[];
  /** Optional per-portal token key for portals that can be open side-by-side. */
  tokenKey?: string;
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

function isRecoverableAuthError(
  status: number | undefined,
  data: ApiErrorResponse | undefined,
): boolean {
  return (
    status === 401 &&
    (data?.error_code === "invalid_bearer_token" ||
      data?.message_key === "auth.invalid_bearer_token")
  );
}

// ── Auth token ─────────────────────────────────────────

const TOKEN_KEY = "auth_token";

export function setToken(token: string | null, tokenKey = TOKEN_KEY) {
  try {
    if (token) {
      localStorage.setItem(tokenKey, token);
    } else {
      localStorage.removeItem(tokenKey);
    }
  } catch {
    // SSR or no localStorage
  }
}

export function getToken(tokenKey = TOKEN_KEY): string | null {
  try {
    return localStorage.getItem(tokenKey);
  } catch {
    return null;
  }
}

// ── Factory ────────────────────────────────────────────

export function createApi({
  baseURL,
  silentPaths = [],
  tokenKey = TOKEN_KEY,
}: ApiConfig): AxiosInstance {
  const instance = axios.create({
    baseURL,
    headers: { Accept: "application/json" },
  });

  // Request interceptor: attach auth token + locale
  instance.interceptors.request.use((config) => {
    const token = getToken(tokenKey);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers["Accept-Language"] = localeStore.locale;
    const timezone = getBrowserTimezone();
    if (timezone) {
      config.headers.TIMEZONE = timezone;
    }
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

      // Silent paths and recoverable auth refresh failures — no toast
      const isSilent = silentPaths.some((p) => url === p || url.endsWith(p));
      if (isSilent || isRecoverableAuthError(status, data)) {
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
