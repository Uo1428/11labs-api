import { FIREBASE_API_KEY } from "./config";
import type { Account } from "./types";

const tokenCache = new Map<string, { token: string; exp: number }>();
const inFlight = new Map<string, Promise<string>>();

async function refresh(account: Account): Promise<string> {
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        referer: "https://elevenlabs.io/",
        origin: "https://elevenlabs.io",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: account.refreshToken,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `token refresh failed (${res.status}) for ${account.label}: ${await res.text()}`,
    );
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(account.id, {
    token: data.access_token,
    exp: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}

export function getAccessToken(account: Account): Promise<string> {
  const cached = tokenCache.get(account.id);
  if (cached && cached.exp - Date.now() > 60_000) return Promise.resolve(cached.token);

  let p = inFlight.get(account.id);
  if (!p) {
    p = refresh(account);
    inFlight.set(account.id, p);
    p.finally(() => inFlight.delete(account.id)).catch(() => {});
  }
  return p;
}

export function invalidate(accountId: string) {
  tokenCache.delete(accountId);
}

export function cachedTokenState(accountId: string): "valid" | "expired" | "none" {
  const c = tokenCache.get(accountId);
  if (!c) return "none";
  return c.exp - Date.now() > 0 ? "valid" : "expired";
}