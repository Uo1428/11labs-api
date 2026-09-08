export interface ApiOptions {
  account?: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

const ADMIN_KEY_STORAGE = "ll_admin_key";

export function getAdminKey(): string {
  try {
    return localStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setAdminKey(key: string) {
  try {
    localStorage.setItem(ADMIN_KEY_STORAGE, key);
  } catch {
    // storage unavailable
  }
}

export function clearAdminKey() {
  try {
    localStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    // storage unavailable
  }
}

export const API_BASE = (
  import.meta.env.VITE_API_BASE as string | undefined
)?.replace(/\/$/, "") ?? "https://ffx6qtbs-4000.inc1.devtunnels.ms";

export async function api(path: string, opts: ApiOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  headers["x-account"] = opts.account ?? "auto";
  const adminKey = getAdminKey();
  if (adminKey) headers["x-admin-key"] = adminKey;
  if (opts.body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(API_BASE + "/api" + path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      window.dispatchEvent(new Event("ll:unauthorized"));
    }
    throw new Error(text || res.statusText);
  }
  return res;
}