import { getToken, setToken } from "@shared/api/createApi";
import { createStore, useStore } from "@shared/store/createStore";
import type { AxiosError } from "axios";
import type { AuthActor, AuthConfig, AuthState } from "./types";

interface TokenPairResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

const DEFAULT_AUTH_TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_SUFFIX = ":refresh";
const REFRESH_RETRY_DELAY_MS = 60_000;

function getRefreshTokenKey(tokenKey?: string): string {
  return `${tokenKey ?? DEFAULT_AUTH_TOKEN_KEY}${REFRESH_TOKEN_SUFFIX}`;
}

function setStoredRefreshToken(token: string | null, tokenKey?: string) {
  try {
    const key = getRefreshTokenKey(tokenKey);
    if (token) {
      localStorage.setItem(key, token);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // SSR or no localStorage
  }
}

function getStoredRefreshToken(tokenKey?: string): string | null {
  try {
    return localStorage.getItem(getRefreshTokenKey(tokenKey));
  } catch {
    return null;
  }
}

function isAuthRejection(error: unknown): boolean {
  const status = (error as AxiosError | undefined)?.response?.status;
  return status === 400 || status === 401 || status === 403;
}

/**
 * Create an auth actor for a portal.
 *
 * Forge Starter baseline (admin + user portals):
 *   const auth = createAuth<UserResponse>({
 *     api,
 *     mode: "token",
 *     paths: { login: "/auth/login", refresh: "/auth/refresh", logout: "/auth/logout", me: "/me" },
 *   });
 */
export function createAuth<TUser>(config: AuthConfig): AuthActor<TUser> {
  const { api, mode, paths, tokenKey } = config;

  // ── State ──────────────────────────────────────────

  const store = createStore<AuthState<TUser>>({
    user: null,
    authenticated: false,
    busy: true, // true until initial check() completes
  });

  // Access + refresh tokens are localStorage-backed so deploy asset reloads do
  // not force a login when the server-side refresh token is still valid.
  let refreshToken: string | null = getStoredRefreshToken(tokenKey);
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  // ── Token management (token mode only) ─────────────

  function scheduleRefresh(expiresIn: number) {
    clearRefresh();
    if (mode !== "token" || !paths.refresh) return;

    // Refresh 60 seconds before expiry (minimum 10s)
    const delay = Math.max((expiresIn - 60) * 1000, 10_000);
    refreshTimer = setTimeout(() => {
      refresh().catch(handleRefreshFailure);
    }, delay);
  }

  function clearRefresh() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = undefined;
    }
  }

  function currentRefreshToken(): string | null {
    refreshToken ??= getStoredRefreshToken(tokenKey);
    return refreshToken;
  }

  function scheduleRefreshRetry() {
    clearRefresh();
    if (mode !== "token" || !paths.refresh || !currentRefreshToken()) return;

    refreshTimer = setTimeout(() => {
      refresh().catch(handleRefreshFailure);
    }, REFRESH_RETRY_DELAY_MS);
  }

  function handleRefreshFailure(error: unknown) {
    if (isAuthRejection(error)) {
      clearAuth();
      return;
    }

    scheduleRefreshRetry();
  }

  function storeTokens(tokens: TokenPairResponse) {
    setToken(tokens.access_token, tokenKey);
    refreshToken = tokens.refresh_token;
    setStoredRefreshToken(tokens.refresh_token, tokenKey);
    scheduleRefresh(tokens.expires_in);
  }

  function clearAuth() {
    clearRefresh();
    setToken(null, tokenKey);
    refreshToken = null;
    setStoredRefreshToken(null, tokenKey);
    store.setState({ user: null, authenticated: false, busy: false });
  }

  // ── 401 interceptor — auto-refresh + retry ─────────

  let isRefreshing = false;
  let pendingRequests: Array<{
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }> = [];

  api.interceptors.response.use(undefined, async (error: AxiosError) => {
    const originalRequest = error.config;
    if (!originalRequest || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // Don't retry auth endpoints themselves
    const isAuthPath =
      originalRequest.url === paths.login ||
      originalRequest.url === paths.refresh ||
      originalRequest.url === paths.logout;
    if (isAuthPath) {
      return Promise.reject(error);
    }

    // Token mode: try refresh before giving up
    if (mode === "token" && currentRefreshToken() && paths.refresh) {
      const requestToRetry = originalRequest;

      if (isRefreshing) {
        // Queue this request — it will be retried after refresh completes
        return new Promise((resolve, reject) => {
          pendingRequests.push({ resolve, reject });
        }).then(() => {
          delete requestToRetry.headers?.Authorization;
          return api(requestToRetry);
        });
      }

      isRefreshing = true;

      try {
        await refresh();
        isRefreshing = false;

        // Retry all queued requests
        pendingRequests.forEach(({ resolve }) => {
          resolve(undefined);
        });
        pendingRequests = [];

        // Retry with fresh token (clear stale header so interceptor re-attaches)
        delete requestToRetry.headers?.Authorization;
        return api(requestToRetry);
      } catch (refreshError) {
        isRefreshing = false;
        pendingRequests.forEach(({ reject }) => {
          reject(error);
        });
        pendingRequests = [];
        if (isAuthRejection(refreshError)) {
          clearAuth();
        } else {
          scheduleRefreshRetry();
        }
        return Promise.reject(error);
      }
    }

    // Session mode or no refresh token: just clear auth
    clearAuth();
    return Promise.reject(error);
  });

  // ── Public API ─────────────────────────────────────

  async function login(credentials: Record<string, string>): Promise<TUser> {
    // Don't set auth store busy here — the form's own busy handles loading state.
    // Setting busy would unmount the login page (App.tsx returns null when busy).

    const { data } = await api.post(paths.login, credentials);

    if (mode === "token" && data.access_token) {
      storeTokens(data as TokenPairResponse);
    }

    const user = await fetchMe();
    if (!user) throw new Error("Failed to fetch user profile");

    return user;
  }

  async function acceptTokens(tokens: TokenPairResponse): Promise<TUser> {
    if (mode === "token") {
      storeTokens(tokens);
    }

    const user = await fetchMe();
    if (!user) throw new Error("Failed to fetch user profile");

    return user;
  }

  async function logout(): Promise<void> {
    try {
      if (paths.logout) {
        await api.post(paths.logout).catch(() => {});
      }
    } finally {
      clearAuth();
    }
  }

  async function refresh(): Promise<void> {
    const token = currentRefreshToken();
    if (mode !== "token" || !paths.refresh || !token) {
      return;
    }

    const { data } = await api.post<TokenPairResponse>(paths.refresh, {
      refresh_token: token,
    });

    storeTokens(data);
  }

  async function fetchMe(): Promise<TUser | null> {
    try {
      const { data } = await api.get<TUser>(paths.me);
      store.setState({ user: data, authenticated: true, busy: false });
      return data;
    } catch {
      store.setState({ user: null, authenticated: false, busy: false });
      return null;
    }
  }

  function getUser(): TUser | null {
    return store.getState().user;
  }

  function isAuthenticatedFn(): boolean {
    return store.getState().authenticated;
  }

  function useAuth(): AuthState<TUser> {
    return useStore(store);
  }

  function onAuthChange(callback: (user: TUser | null) => void): () => void {
    let prevUser = store.getState().user;
    return store.subscribe(() => {
      const currentUser = store.getState().user;
      if (currentUser !== prevUser) {
        prevUser = currentUser;
        callback(currentUser);
      }
    });
  }

  /**
   * Check auth state on app startup.
   * Call once in App.tsx useEffect or at mount.
   *
   * - Token mode: if token exists in localStorage, fetch /me to verify
   * - Session mode: fetch /me (cookie sent automatically)
   */
  async function check(): Promise<void> {
    store.setState({ busy: true });

    if (mode === "token") {
      const token = getToken(tokenKey);
      if (!token) {
        if (!currentRefreshToken()) {
          store.setState({ user: null, authenticated: false, busy: false });
          return;
        }

        try {
          await refresh();
        } catch (error) {
          if (isAuthRejection(error)) {
            clearAuth();
          } else {
            store.setState({ user: null, authenticated: false, busy: false });
            scheduleRefreshRetry();
          }
          return;
        }
      }
    }

    await fetchMe();
  }

  return {
    login,
    acceptTokens,
    logout,
    refresh,
    fetchMe,
    getUser,
    isAuthenticated: isAuthenticatedFn,
    useAuth,
    onAuthChange,
    check,
  };
}
