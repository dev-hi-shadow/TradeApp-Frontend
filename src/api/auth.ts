import { api, getRefreshToken } from './client';
import type { User } from '../types';

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: User;
}

export function register(username: string, email: string, password: string) {
  return api<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
}

export function login(emailOrUsername: string, password: string) {
  return api<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ emailOrUsername, password }),
  });
}

/** Exchange a Google ID-token (from the GIS button) for a Tradar session. */
export function googleLogin(credential: string) {
  return api<AuthResponse>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
}

export function me() {
  return api<{ user: User; watchlist: string[] }>('/api/account/me');
}

/** Public auth config — whether Google is enabled + its (public) client id. */
export function getAuthConfig() {
  return api<{ googleSignIn: boolean; googleClientId: string }>('/api/auth/config');
}

/** Always resolves with a generic message (server never reveals if the email exists). */
export function forgotPassword(email: string) {
  return api<{ ok: boolean; message: string }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/** Consumes a reset token + new password; on success returns a fresh session (auto sign-in). */
export function resetPassword(token: string, password: string) {
  return api<AuthResponse>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

/** Authenticated: change own password (verifies the current one). */
export function changePassword(currentPassword: string, newPassword: string) {
  return api<{ ok: boolean; message: string }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

/** Confirm an email address from the link token. */
export function verifyEmail(token: string) {
  return api<{ ok: boolean; message: string }>('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

/** Re-send the signup confirmation email (authenticated). */
export function resendVerification() {
  return api<{ ok: boolean; message: string }>('/api/auth/resend-verification', { method: 'POST' });
}

/** Revoke just this device's refresh session on the server (best-effort logout). */
export function logoutSession(refreshToken: string) {
  return api<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export interface SessionInfo {
  id: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

/** The current refresh token is sent as a header so the server can flag "this device". */
function refreshHeader(): Record<string, string> {
  const rt = getRefreshToken();
  return rt ? { 'x-refresh-token': rt } : {};
}

export function listSessions() {
  return api<{ sessions: SessionInfo[] }>('/api/auth/sessions', { headers: refreshHeader() });
}

export function revokeSession(id: string) {
  return api<{ ok: boolean }>(`/api/auth/sessions/${id}`, { method: 'DELETE' });
}

export function revokeOtherSessions() {
  return api<{ ok: boolean; revoked: number }>('/api/auth/sessions/revoke-others', {
    method: 'POST',
    headers: refreshHeader(),
  });
}
