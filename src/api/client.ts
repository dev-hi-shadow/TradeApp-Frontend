// Empty default → use relative URLs so Vite proxy (dev) and any reverse proxy (prod / ngrok) work.
const API_URL = import.meta.env.VITE_API_URL ?? '';

const TOKEN_KEY = 'token';
const REFRESH_KEY = 'refreshToken';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}
export function setTokens(token: string, refreshToken?: string) {
  localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}
export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// Single-flight refresh: if many requests 401 at once, only ONE hits /refresh;
// the rest await the same promise.
let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.token) return null;
    setTokens(data.token, data.refreshToken);
    // Tell AuthContext (and via it, the live WebSocket) about the new token so
    // the socket reconnects with a valid token instead of the expired one.
    window.dispatchEvent(new CustomEvent('auth:token-refreshed', { detail: { token: data.token } }));
    return data.token as string;
  } catch {
    return null;
  }
}

/** Coalesced refresh — concurrent callers share one network round-trip. */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Fired when a session can't be refreshed — AuthContext listens and signs out. */
function emitSessionExpired() {
  clearTokens();
  window.dispatchEvent(new CustomEvent('auth:session-expired'));
}

const AUTH_FREE = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/google', '/api/auth/forgot-password', '/api/auth/reset-password'];

export async function api<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const send = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // ngrok-free's browser-warning interstitial intercepts AJAX from real
      // browsers unless this header is present. Harmless when not on ngrok.
      'ngrok-skip-browser-warning': '1',
      ...((init.headers as Record<string, string>) || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${API_URL}${path}`, { ...init, headers });
  };

  let res = await send(getToken());

  // Access token expired → try ONE transparent refresh + retry (except on the
  // auth endpoints themselves, where a 401 is a real credential failure).
  if (res.status === 401 && !AUTH_FREE.some((p) => path.startsWith(p)) && getRefreshToken()) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      res = await send(fresh);
    } else {
      emitSessionExpired();
    }
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err: any = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export const apiBase = API_URL;
