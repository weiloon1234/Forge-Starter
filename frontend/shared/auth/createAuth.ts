import type { AxiosError } from "axios";
import { createStore, useStore } from "../store/createStore";
import { setToken, getToken } from "../api/createApi";
import type { AuthConfig, AuthState, AuthActor } from "./types";

interface TokenPairResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Create an auth actor for a portal.
 *
 * Token mode (user portal):
 *   const auth = createAuth<UserResponse>({
 *     api,
 *     mode: "token",
 *     paths: { login: "/auth/login", refresh: "/auth/refresh", logout: "/auth/logout", me: "/me" },
 *   });
 *
 * Session mode (admin portal):
 *   const auth = createAuth<AdminUserResponse>({
 *     api,
 *     mode: "session",
 *     paths: { login: "/auth/login", logout: "/auth/logout", me: "/me" },
 *   });
 */
export function createAuth<TUser>(config: AuthConfig<TUser>): AuthActor<TUser> {
  const { api, mode, paths } = config;

  // ── State ──────────────────────────────────────────

  const store = createStore<AuthState<TUser>>({
    user: null,
    authenticated: false,
    busy: true, // true until initial check() completes
  });

  // Refresh token: memory only (not persisted — more secure against XSS)
  // Access token: localStorage (via setToken in createApi.ts)
  let refreshToken: string | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  // ── Token management (token mode only) ─────────────

  function scheduleRefresh(expiresIn: number) {
    clearRefresh();
    if (mode !== "token" || !paths.refresh) return;

    // Refresh 60 seconds before expiry (minimum 10s)
    const delay = Math.max((expiresIn - 60) * 1000, 10_000);
    refreshTimer = setTimeout(() => {
      refresh().catch(() => {
        // Refresh failed — force logout
        clearAuth();
      });
    }, delay);
  }

  function clearRefresh() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = undefined;
    }
  }

  function storeTokens(tokens: TokenPairResponse) {
    setToken(tokens.access_token);
    refreshToken = tokens.refresh_token;
    scheduleRefresh(tokens.expires_in);
  }

  function clearAuth() {
    clearRefresh();
    setToken(null);
    refreshToken = null;
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
    if (mode === "token" && refreshToken && paths.refresh) {
      if (isRefreshing) {
        // Queue this request — it will be retried after refresh completes
        return new Promise((resolve, reject) => {
          pendingRequests.push({ resolve, reject });
        }).then(() => {
          delete originalRequest!.headers?.Authorization;
          return api(originalRequest!);
        });
      }

      isRefreshing = true;

      try {
        await refresh();
        isRefreshing = false;

        // Retry all queued requests
        pendingRequests.forEach(({ resolve }) => resolve(undefined));
        pendingRequests = [];

        // Retry with fresh token (clear stale header so interceptor re-attaches)
        delete originalRequest.headers?.Authorization;
        return api(originalRequest);
      } catch {
        isRefreshing = false;
        pendingRequests.forEach(({ reject }) => reject(error));
        pendingRequests = [];
        clearAuth();
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
    if (mode !== "token" || !paths.refresh || !refreshToken) {
      return;
    }

    const { data } = await api.post<TokenPairResponse>(paths.refresh, {
      refresh_token: refreshToken,
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
      const token = getToken();
      if (!token) {
        store.setState({ user: null, authenticated: false, busy: false });
        return;
      }
    }

    await fetchMe();
  }

  return {
    login,
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
