import { UPSTREAM_BASE } from "./config";
import { getAccessToken, invalidate } from "./firebase";
import { getAccount, listAccounts } from "./store";
import type { Account, SubscriptionInfo } from "./types";

export class UpstreamError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`upstream ${status}`);
    this.status = status;
    this.body = body;
  }
}

const XI_HEADERS: Record<string, string> = {
  origin: "https://elevenlabs.io",
  referer: "https://elevenlabs.io/",
  "x-generation-actor": "User",
  "x-generation-surface": "XI_APP",
  accept: "*/*",
};

export async function upstreamFetch(
  account: Account,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken(account);
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(XI_HEADERS)) headers.set(k, v);
  headers.set("authorization", `Bearer ${token}`);

  const res = await fetch(`${UPSTREAM_BASE}${path}`, { ...init, headers });
  if (res.status === 401) invalidate(account.id);
  if (!res.ok) throw new UpstreamError(res.status, await res.text());
  return res;
}

const subCache = new Map<string, { info: SubscriptionInfo; fetchedAt: number }>();

export async function getSubscription(
  account: Account,
  force = false,
): Promise<SubscriptionInfo> {
  const cached = subCache.get(account.id);
  if (!force && cached && Date.now() - cached.fetchedAt < 30_000) return cached.info;

  try {
    const j = (await (await upstreamFetch(account, "/v1/user/subscription")).json()) as {
      tier: string;
      character_count: number;
      character_limit: number;
      next_character_count_reset_unix: number;
      currency: string;
      status: string;
    };
    const info: SubscriptionInfo = {
      tier: j.tier,
      used: j.character_count,
      limit: j.character_limit,
      remaining: j.character_limit - j.character_count,
      resetUnix: j.next_character_count_reset_unix,
      currency: j.currency,
      status: j.status,
    };
    subCache.set(account.id, { info, fetchedAt: Date.now() });
    return info;
  } catch (e) {
    if (cached) return cached.info;
    throw e;
  }
}

export function applyCreditDelta(accountId: string, cost: number) {
  const cached = subCache.get(accountId);
  if (cached) {
    cached.info.used += cost;
    cached.info.remaining = Math.max(0, cached.info.remaining - cost);
  }
}

const queues = new Map<string, Promise<unknown>>();

export function enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  queues.set(
    key,
    next.catch(() => {}),
  );
  return next;
}

export function estimateFromText(text: string): number {
  return text ? text.length : 0;
}

export async function rankAccounts(estimate: number): Promise<Account[]> {
  const active = listAccounts().filter((a) => a.active);
  if (active.length === 0) throw new UpstreamError(400, "no active accounts configured");

  const scored = await Promise.all(
    active.map(async (a) => {
      let remaining = -1;
      try {
        remaining = (await getSubscription(a)).remaining;
      } catch {
        // unreadable subscription -> lowest priority
      }
      return { a, remaining };
    }),
  );

  const enough = scored.filter((s) => s.remaining >= estimate);
  const pool = enough.length ? enough : scored;
  pool.sort((x, y) => y.remaining - x.remaining || x.a.createdAt - y.a.createdAt);
  return pool.map((s) => s.a);
}

export async function pickAutoAccount(estimate: number): Promise<Account> {
  return (await rankAccounts(estimate))[0];
}

export function resolveAccountById(id: string): Account {
  const acc = getAccount(id);
  if (!acc) throw new UpstreamError(404, "account not found");
  return acc;
}