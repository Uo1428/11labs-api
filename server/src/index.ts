import express from "express";
import cors from "cors";
import { Readable } from "node:stream";
import type { Request, Response, NextFunction } from "express";
import { PORT } from "./config";
import {
  load,
  listAccounts,
  getAccount,
  addAccount,
  updateAccount,
  deleteAccount,
} from "./store";
import {
  upstreamFetch,
  getSubscription,
  rankAccounts,
  pickAutoAccount,
  resolveAccountById,
  estimateFromText,
  applyCreditDelta,
  enqueue,
  UpstreamError,
} from "./upstream";
import { cachedTokenState } from "./firebase";
import type { Account, AccountView } from "./types";
import {
  init as initKeys,
  authenticate,
  listApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
} from "./keys";
import type { Principal } from "./keys";
import {
  initObservability,
  logRequest,
  logError,
  getOverview,
  getKeysUsage,
  getKeySeries,
  getRequestLogs,
  getErrorLogs,
  clearLogs,
  getLastErrorForAccount,
  getLastUsageForAccount,
  countErrorsForAccount,
} from "./observe";

load();
initKeys();
initObservability();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ---- auth ----

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal;
    }
  }
}

function gate(req: Request, res: Response, next: NextFunction) {
  const p = authenticate(req);
  if (!p) {
    return res
      .status(401)
      .json({ error: "missing or invalid credential: send a valid x-admin-key or x-api-key header" });
  }
  req.principal = p;
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.principal?.role === "admin") return next();
  res.status(403).json({ error: "admin access required" });
}

function recordError(req: Request, e: unknown, status: number) {
  const account = (req as any)._account as Account | undefined;
  const principal = req.principal;
  logError({
    ts: Date.now(),
    keyId: principal?.role === "key" ? principal.key.id : null,
    keyName: principal?.role === "key" ? principal.key.name : null,
    method: req.method,
    path: req.route?.path ?? req.path,
    accountId: account?.id ?? null,
    accountLabel: account?.label ?? account?.email ?? null,
    status,
    message: e instanceof Error ? e.message : String(e),
    stack: e instanceof Error ? e.stack : undefined,
  });
}

function sendError(req: Request, res: express.Response, e: unknown) {
  const status = e instanceof UpstreamError ? e.status : 500;
  recordError(req, e, status);
  if (e instanceof UpstreamError) {
    res.status(e.status).type("json").send(e.body || JSON.stringify({ error: e.message }));
    return;
  }
  const message = e instanceof Error ? e.message : String(e);
  res.status(500).json({ error: message });
}

function view(acc: Account): AccountView {
  const { refreshToken: _rt, ...rest } = acc;
  return { ...rest, label: acc.label || acc.email || "Account", subscription: null };
}

async function resolveAccount(req: express.Request): Promise<Account> {
  const mode = (req.header("x-account") ?? "auto").trim();
  let account: Account;
  if (mode === "auto") account = await pickAutoAccount(estimateFromText(req.body?.text ?? ""));
  else account = resolveAccountById(mode);
  (req as any)._account = account;
  return account;
}

async function jsonRoute(res: express.Response, path: string, account: Account) {
  res.json(await (await upstreamFetch(account, path)).json());
}

// ---- static response cache (voices, shared voices, voice settings) ----

const jsonCache = new Map<string, { body: string; fetchedAt: number }>();
const JSON_TTL = 10 * 60_000;

async function cachedJson(
  res: express.Response,
  cacheKey: string,
  account: Account,
  path: string,
  ttl = JSON_TTL,
) {
  const now = Date.now();
  const hit = jsonCache.get(cacheKey);
  if (hit && now - hit.fetchedAt < ttl) {
    res.type("json").send(hit.body);
    return;
  }
  const up = await upstreamFetch(account, path);
  const body = await up.text();
  jsonCache.set(cacheKey, { body, fetchedAt: now });
  res.type("json").send(body);
}

app.get("/", (_req, res) => res.json({ ok: true }));

// Every /api route needs a valid credential (admin key or an issued API key).
app.use("/api", gate);

// Record request metrics + audit trail for every authenticated request.
app.use("/api", (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const principal = req.principal;
    const account = (req as any)._account as Account | undefined;
    logRequest({
      ts: Date.now(),
      keyId: principal?.role === "key" ? principal.key.id : null,
      keyName: principal?.role === "key" ? principal.key.name : null,
      method: req.method,
      path: req.route?.path ?? req.path,
      accountId: account?.id ?? null,
      accountLabel: account?.label ?? account?.email ?? null,
      status: res.statusCode,
      chars: res.locals.chars ?? 0,
      ms: Date.now() - start,
    });
  });
  next();
});

// ---- admin ----

app.get("/api/admin/verify", requireAdmin, (_req, res) => res.json({ ok: true }));

// ---- api keys (admin only) ----

app.use("/api/api-keys", requireAdmin);

app.get("/api/api-keys", (_req, res) => {
  res.json(listApiKeys());
});

app.post("/api/api-keys", (req, res) => {
  const { name } = req.body ?? {};
  res.status(201).json(createApiKey(name));
});

app.patch("/api/api-keys/:id", (req, res) => {
  const { name, active } = req.body ?? {};
  const k = updateApiKey(req.params.id, { name, active });
  if (!k) return res.status(404).json({ error: "not found" });
  res.json(k);
});

app.delete("/api/api-keys/:id", (req, res) => {
  deleteApiKey(req.params.id);
  res.status(204).end();
});

// ---- usage / logs (admin only) ----

const qs = (req: Request, key: string) => String(req.query[key] ?? "").trim();

function parseDays(req: Request) {
  const n = Number(req.query.days ?? 30);
  return Math.min(90, Math.max(1, Number.isFinite(n) ? n : 30));
}

function parseLimit(req: Request) {
  const n = Number(req.query.limit ?? 100);
  return Math.min(500, Math.max(1, Number.isFinite(n) ? n : 100));
}

app.use("/api/usage", requireAdmin);

app.get("/api/usage/overview", (req, res) => res.json(getOverview(parseDays(req))));
app.get("/api/usage/keys", (req, res) => res.json(getKeysUsage(parseDays(req))));
app.get("/api/usage/keys/:id", (req, res) => res.json(getKeySeries(req.params.id, parseDays(req))));

app.get("/api/logs", requireAdmin, (req, res) =>
  res.json(
    getRequestLogs({
      limit: parseLimit(req),
      keyId: qs(req, "keyId") || undefined,
      account: qs(req, "account") || undefined,
      status: qs(req, "status") || undefined,
      path: qs(req, "path") || undefined,
    }),
  ),
);

app.get("/api/errors", requireAdmin, (req, res) => res.json(getErrorLogs(parseLimit(req))));

app.delete("/api/logs", requireAdmin, (_req, res) => {
  clearLogs();
  res.status(204).end();
});

// ---- accounts (admin only) ----

app.use("/api/accounts", requireAdmin);

app.get("/api/accounts", async (req, res) => {
  try {
    const out = await Promise.all(
      listAccounts().map(async (a) => {
        let subscription = null;
        try {
          subscription = await getSubscription(a);
        } catch {
          // keep null
        }
        return { ...view(a), subscription };
      }),
    );
    res.json(out);
  } catch (e) {
    sendError(req, res, e);
  }
});

app.post("/api/accounts", async (req, res) => {
  const { label, refreshToken } = req.body ?? {};
  if (!refreshToken || typeof refreshToken !== "string") {
    return res.status(400).json({ error: "refreshToken required" });
  }
  const account = addAccount({ label, refreshToken });
  try {
    const me = (await (await upstreamFetch(account, "/v1/auth-account")).json()) as {
      email?: string;
      first_name?: string;
    };
    updateAccount(account.id, {
      email: me.email,
      label: label?.trim() || me.first_name || me.email || account.label,
    });
    res.status(201).json(view(getAccount(account.id)!));
  } catch (e) {
    deleteAccount(account.id);
    sendError(req, res, new Error("invalid refresh token: " + (e as Error).message));
  }
});

app.patch("/api/accounts/:id", (req, res) => {
  const { label, active } = req.body ?? {};
  const a = updateAccount(req.params.id, { label, active });
  if (!a) return res.status(404).json({ error: "not found" });
  res.json(view(a));
});

app.delete("/api/accounts/:id", (req, res) => {
  deleteAccount(req.params.id);
  res.status(204).end();
});

// ---- me / subscription ----

app.get("/api/me", async (req, res) => {
  try {
    const account = await resolveAccount(req);
    await jsonRoute(res, "/v1/auth-account", account);
  } catch (e) {
    sendError(req, res, e);
  }
});

app.get("/api/subscription", async (req, res) => {
  try {
    const account = await resolveAccount(req);
    res.json(await getSubscription(account, true));
  } catch (e) {
    sendError(req, res, e);
  }
});

// ---- voices ----

app.get("/api/voices", async (req, res) => {
  try {
    const account = await resolveAccount(req);
    await jsonRoute(res, "/v1/voices", account);
  } catch (e) {
    sendError(req, res, e);
  }
});

app.get("/api/voices/collections", async (req, res) => {
  try {
    const account = await resolveAccount(req);
    await jsonRoute(res, "/v1/voices/collections", account);
  } catch (e) {
    sendError(req, res, e);
  }
});

app.get("/api/voices/:id/settings", async (req, res) => {
  try {
    const account = await resolveAccount(req);
    await jsonRoute(res, `/v1/voices/${req.params.id}/settings`, account);
  } catch (e) {
    sendError(req, res, e);
  }
});

app.get("/api/shared-voices", async (req, res) => {
  try {
    const account = await resolveAccount(req);
    const sort = req.query.sort ?? "trending";
    const page = req.query.page ?? "1";
    const pageSize = req.query.page_size ?? "30";
    await jsonRoute(
      res,
      `/v1/shared-voices?sort=${sort}&page=${page}&page_size=${pageSize}&explore_source=tts_explore_tab`,
      account,
    );
  } catch (e) {
    sendError(req, res, e);
  }
});

// ---- TTS ----

app.post("/api/tts/:voiceId/stream", async (req, res) => {
  let account: Account;
  try {
    account = await resolveAccount(req);
  } catch (e) {
    return sendError(req, res, e);
  }

  const estimate = estimateFromText(req.body?.text ?? "");
  try {
    const before = await getSubscription(account);
    const up = await enqueue(account.id, () =>
      upstreamFetch(account, `/v1/text-to-speech/${req.params.voiceId}/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req.body ?? {}),
      }),
    );

    const characterCost = Number(up.headers.get("character-cost") ?? estimate);
    applyCreditDelta(account.id, characterCost);
    res.locals.chars = characterCost;

    res.setHeader("content-type", up.headers.get("content-type") ?? "audio/mpeg");
    res.setHeader("x-account-id", account.id);
    res.setHeader("x-account-label", account.label ?? account.email ?? "Account");
    res.setHeader("x-character-cost", String(characterCost));
    res.setHeader("x-credit-remaining", String(Math.max(0, before.remaining - characterCost)));
    for (const h of [
      "history-item-id",
      "request-id",
      "current-concurrent-requests",
      "maximum-concurrent-requests",
    ]) {
      const v = up.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    Readable.fromWeb(up.body as never).pipe(res);
  } catch (e) {
    sendError(req, res, e);
  }
});

// ---- history ----

app.get("/api/history", async (req, res) => {
  try {
    const account = await resolveAccount(req);
    const pageSize = req.query.page_size ?? "20";
    await jsonRoute(
      res,
      `/v1/history?page_size=${pageSize}&source=TTS&sort_direction=desc`,
      account,
    );
  } catch (e) {
    sendError(req, res, e);
  }
});

app.get("/api/history/:id", async (req, res) => {
  try {
    const account = await resolveAccount(req);
    await jsonRoute(res, `/v1/history/${req.params.id}`, account);
  } catch (e) {
    sendError(req, res, e);
  }
});

app.get("/api/history/:id/audio", async (req, res) => {
  try {
    const account = await resolveAccount(req);
    const up = await upstreamFetch(account, `/v1/history/${req.params.id}/audio`);
    res.setHeader("content-type", up.headers.get("content-type") ?? "audio/mpeg");
    Readable.fromWeb(up.body as never).pipe(res);
  } catch (e) {
    sendError(req, res, e);
  }
});

app.delete("/api/history/:id", async (req, res) => {
  try {
    const account = await resolveAccount(req);
    await upstreamFetch(account, `/v1/history/${req.params.id}`, { method: "DELETE" });
    res.status(204).end();
  } catch (e) {
    sendError(req, res, e);
  }
});

app.listen(PORT, () => console.log(`proxy listening on http://localhost:${PORT}`));