import type { AxiosInstance } from "axios";

export interface AuthPaths {
  login: string;
  logout?: string;
  refresh?: string;
  me: string;
}

export interface AuthConfig {
  /** Portal's axios instance (created by createApi). */
  api: AxiosInstance;
  /** Starter portals use "token"; "session" remains available for other Forge apps. */
  mode: "token" | "session";
  /** API paths relative to the portal's baseURL. */
  paths: AuthPaths;
}

export interface AuthState<TUser> {
  user: TUser | null;
  authenticated: boolean;
  busy: boolean;
}

export interface AuthActor<TUser> {
  /** Login with credentials. Returns the user on success. */
  login(credentials: Record<string, string>): Promise<TUser>;
  /** Logout — clears token/session + user store. */
  logout(): Promise<void>;
  /** Refresh token (token mode only). Auto-called before expiry. */
  refresh(): Promise<void>;
  /** Fetch /me and update user store. */
  fetchMe(): Promise<TUser | null>;
  /** Get current user (non-reactive). */
  getUser(): TUser | null;
  /** Check if authenticated (non-reactive). */
  isAuthenticated(): boolean;
  /** React hook — re-renders on auth state change. */
  useAuth(): AuthState<TUser>;
  /** Subscribe to auth changes (non-React). Returns unsubscribe. */
  onAuthChange(callback: (user: TUser | null) => void): () => void;
  /** Check auth on mount (call once in App.tsx). */
  check(): Promise<void>;
}
