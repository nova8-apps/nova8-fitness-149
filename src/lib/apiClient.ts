// ─── API client ─────────────────────────────────────────────────────────────
// Single fetch wrapper every screen should use. It:
//   1. Picks the right base URL automatically (dev web → :3000, native → env)
//   2. Adds the x-auth-token header when a token is saved
//   3. Parses JSON safely and surfaces structured errors
//   4. Exposes BOTH styles:
//        - apiClient<T>(path, options) — original signature used by legacy code
//        - api.get/post/put/del(path, body) — new ergonomic shape
//
// Override with EXPO_PUBLIC_API_BASE_URL if you want to point at a hosted
// backend (e.g. Railway / Fly). Without that, on web it auto-derives the
// base URL from window.location and swaps :8081 (Expo dev) for :3000.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const ZUSTAND_PERSIST_KEY = 'macr-store'; // legacy Zustand persist slice

// ─── Base URL ───────────────────────────────────────────────────────────────
function resolveBaseUrl(): string {
  const env = (process.env.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, port } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:3000`;
    }
    // E2B preview: hostname is like 8081-<sandbox>.e2b.app — swap prefix.
    if (port === '8081' || hostname.startsWith('8081-')) {
      const swapped = hostname.replace(/^8081-/, '3000-');
      return `${protocol}//${swapped}`;
    }
    return `${protocol}//${hostname}${port ? ':' + port : ''}`;
  }

  return 'http://localhost:3000';
}

const BASE_URL = resolveBaseUrl();

// ─── Token storage ──────────────────────────────────────────────────────────
let cachedToken: string | null = null;

/** Read the session token from whichever slot currently holds it.
 *  Priority: in-memory cache → auth_token key → zustand macr-store.sessionToken. */
export async function getToken(): Promise<string | null> {
  if (cachedToken !== null) return cachedToken;
  try {
    const direct = await AsyncStorage.getItem(TOKEN_KEY);
    if (direct) {
      cachedToken = direct;
      return cachedToken;
    }
    // Fallback: legacy Zustand persist slice.
    const raw = await AsyncStorage.getItem(ZUSTAND_PERSIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const tok = parsed?.state?.sessionToken;
      if (typeof tok === 'string' && tok.length > 0) {
        cachedToken = tok;
        return cachedToken;
      }
    }
  } catch {}
  cachedToken = null;
  return cachedToken;
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  try {
    if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
    else await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {}
}

/** Called from the sign-in/sign-up screens after a successful auth response so
 *  the in-memory cache picks up the new token immediately. */
export function primeToken(token: string | null): void {
  cachedToken = token;
}

export async function getStoredUser<T = any>(): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setStoredUser(user: unknown): Promise<void> {
  try {
    if (user) await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    else await AsyncStorage.removeItem(USER_KEY);
  } catch {}
}

// ─── Core request ──────────────────────────────────────────────────────────
export interface ApiError extends Error {
  status: number;
  detail?: string;
  body?: any;
}

export interface ApiClientOptions extends RequestInit {
  skipAuth?: boolean;
}

/**
 * Canonical fetch wrapper — the one every screen should call.
 *
 * Usage (both supported):
 *   const data = await apiClient<User>('/api/app/149/auth/me');
 *   const data = await apiClient<AuthResp>('/api/app/149/auth/login', {
 *     method: 'POST',
 *     body: JSON.stringify({ email, password }),
 *     skipAuth: true,
 *   });
 *
 * Or via the ergonomic shorthand:
 *   const data = await api.post<AuthResp>('/api/app/149/auth/login', { email, password });
 */
export async function apiClient<T = any>(
  path: string,
  options: ApiClientOptions = {},
): Promise<T> {
  const { skipAuth, headers: userHeaders, body, ...opts } = options;
  const method = (opts.method || 'GET').toUpperCase();

  const url = `${BASE_URL}${path.startsWith('/') ? path : '/' + path}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(userHeaders as Record<string, string> | undefined),
  };

  // Content-Type for bodied requests
  const hasBody = body !== undefined && body !== null;
  if (hasBody && !('Content-Type' in headers) && !('content-type' in headers)) {
    headers['Content-Type'] = 'application/json';
  }

  if (!skipAuth) {
    const tok = await getToken();
    if (tok) {
      headers['x-auth-token'] = tok;
      headers['Authorization'] = `Bearer ${tok}`;
    }
  }

  let res: Response;
  try {
    res = await fetch(url, { ...opts, method, headers, body: hasBody ? (body as BodyInit) : undefined });
  } catch (err: any) {
    const e = new Error(`Network error — ${err?.message || 'fetch failed'}`) as ApiError;
    e.status = 0;
    throw e;
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const raw = await res.text();

  // Guard: if the backend returned HTML (Expo dev bundler fallback / proxy),
  // surface a clear error instead of "Unexpected token <".
  if (!isJson && raw.trim().startsWith('<')) {
    const e = new Error(
      `API returned HTML instead of JSON — check backend is running on :3000 (base=${BASE_URL}).`,
    ) as ApiError;
    e.status = res.status;
    throw e;
  }

  const parsed = isJson && raw ? safeJson(raw) : raw;

  if (!res.ok) {
    const msg =
      parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as any).error === 'string'
        ? (parsed as any).error
        : `API error ${res.status}: ${res.statusText || 'Request failed'}`;
    const e = new Error(msg) as ApiError;
    e.status = res.status;
    e.body = parsed;
    if (parsed && typeof parsed === 'object' && 'detail' in parsed) e.detail = String((parsed as any).detail);
    throw e;
  }

  return parsed as T;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

// ─── Ergonomic shorthand ────────────────────────────────────────────────────
export const api = {
  get:  <T = any>(path: string, opts?: ApiClientOptions) =>
    apiClient<T>(path, { ...opts, method: 'GET' }),
  post: <T = any>(path: string, body?: unknown, opts?: ApiClientOptions) =>
    apiClient<T>(path, { ...opts, method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put:  <T = any>(path: string, body?: unknown, opts?: ApiClientOptions) =>
    apiClient<T>(path, { ...opts, method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
  del:  <T = any>(path: string, opts?: ApiClientOptions) =>
    apiClient<T>(path, { ...opts, method: 'DELETE' }),
  baseUrl: BASE_URL,
};

export default apiClient;

// ─── Auth convenience ───────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: number;
}

export async function signup(email: string, password: string, name?: string): Promise<AuthUser> {
  const { token, user } = await api.post<{ token: string; user: AuthUser }>(
    '/api/app/149/auth/signup',
    { email, password, name: name ?? null },
    { skipAuth: true },
  );
  await setToken(token);
  await setStoredUser(user);
  return user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const { token, user } = await api.post<{ token: string; user: AuthUser }>(
    '/api/app/149/auth/login',
    { email, password },
    { skipAuth: true },
  );
  await setToken(token);
  await setStoredUser(user);
  return user;
}

export async function logout(): Promise<void> {
  try { await api.post('/api/app/149/auth/logout'); } catch {}
  await setToken(null);
  await setStoredUser(null);
}

export async function me(): Promise<AuthUser | null> {
  try {
    const { user } = await api.get<{ user: AuthUser }>('/api/app/149/auth/me');
    await setStoredUser(user);
    return user;
  } catch {
    return null;
  }
}
