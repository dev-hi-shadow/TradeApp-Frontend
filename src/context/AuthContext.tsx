import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '../types';
import * as authApi from '../api/auth';
import { getToken, getRefreshToken, setTokens, clearTokens } from '../api/client';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (emailOrUsername: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  /** Sign in with a Google ID-token credential from the GIS button. */
  loginWithGoogle: (credential: string) => Promise<void>;
  /** Establish a session directly from a bundle (e.g. after a password reset). */
  applyAuth: (token: string, user: User, refreshToken?: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => getToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await authApi.me();
        if (!cancelled) setUser(res.user);
      } catch (err) {
        clearTokens();
        setToken(null);
        setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Keep the in-memory token in sync with transparent background refreshes
  // (fired by the API client / WebSocket). This is what lets the live socket
  // reconnect with a fresh token without a full re-login.
  useEffect(() => {
    function onRefreshed(e: Event) {
      const next = (e as CustomEvent).detail?.token as string | undefined;
      if (next) setToken((prev) => (prev === next ? prev : next));
    }
    function onExpired() {
      clearTokens();
      sessionStorage.clear();
      setToken(null);
      setUser(null);
    }
    window.addEventListener('auth:token-refreshed', onRefreshed as EventListener);
    window.addEventListener('auth:session-expired', onExpired);
    return () => {
      window.removeEventListener('auth:token-refreshed', onRefreshed as EventListener);
      window.removeEventListener('auth:session-expired', onExpired);
    };
  }, []);

  async function login(emailOrUsername: string, password: string) {
    const res = await authApi.login(emailOrUsername, password);
    setTokens(res.token, res.refreshToken);
    setToken(res.token);
    setUser(res.user);
  }
  async function register(username: string, email: string, password: string) {
    const res = await authApi.register(username, email, password);
    setTokens(res.token, res.refreshToken);
    setToken(res.token);
    setUser(res.user);
  }
  async function loginWithGoogle(credential: string) {
    const res = await authApi.googleLogin(credential);
    setTokens(res.token, res.refreshToken);
    setToken(res.token);
    setUser(res.user);
  }
  function applyAuth(newToken: string, newUser: User, refreshToken?: string) {
    setTokens(newToken, refreshToken);
    setToken(newToken);
    setUser(newUser);
  }
  function logout() {
    // Best-effort server-side revoke of THIS device's refresh session.
    const rt = getRefreshToken();
    if (rt) authApi.logoutSession(rt).catch(() => {});
    // Best-effort: stop web-push to this device so the next user here doesn't
    // inherit notifications (fire-and-forget; ignores failures).
    import('../utils/push').then((m) => m.removePushSubscription()).catch(() => {});
    clearTokens();
    // Wipe session-scoped UI flags (e.g. "have we auto-scrolled the option
    // chain spot strip yet?") so the next login behaves like a first visit.
    sessionStorage.clear();
    setToken(null);
    setUser(null);
  }
  async function refreshUser() {
    if (!token) return;
    const res = await authApi.me();
    setUser(res.user);
  }

  return (
    <Ctx.Provider
      value={{ user, token, loading, login, register, loginWithGoogle, applyAuth, logout, refreshUser, setUser }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
