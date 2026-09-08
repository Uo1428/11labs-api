import fs from "node:fs";
import path from "node:path";
import { USAGE_FILE, ERRORS_FILE } from "./config";
import type { UsageEntry, ErrorEntry } from "./types";

const MAX_USAGE = 20_000;
const MAX_ERRORS = 5_000;

let usage: UsageEntry[] = [];
let errors: ErrorEntry[] = [];

let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function ensureDir() {
  fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
}

function readFile(file: string) {
  try {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!dirty) return;
    dirty = false;
    ensureDir();
    try {
      fs.writeFileSync(USAGE_FILE, JSON.stringify(usage));
      fs.writeFileSync(ERRORS_FILE, JSON.stringify(errors));
    } catch {
      // ignore persistence errors
    }
  }, 2_000);
}

export function initObservability() {
  ensureDir();
  usage = readFile(USAGE_FILE);
  errors = readFile(ERRORS_FILE);
}

export function logRequest(entry: UsageEntry) {
  usage.push(entry);
  if (usage.length > MAX_USAGE) usage.splice(0, usage.length - MAX_USAGE);
  scheduleSave();
}

export function logError(entry: ErrorEntry) {
  errors.push(entry);
  if (errors.length > MAX_ERRORS) errors.splice(0, errors.length - MAX_ERRORS);
  scheduleSave();
}

function inWindow(ts: number, days: number) {
  return ts >= Date.now() - days * 86_400_000;
}

function dayKey(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastDays(days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(dayKey(Date.now() - i * 86_400_000));
  }
  return out;
}

export function getOverview(days: number) {
  const window = usage.filter((e) => inWindow(e.ts, days));
  const errWindow = errors.filter((e) => inWindow(e.ts, days));
  const buckets = new Map<string, { requests: number; chars: number; errors: number }>();
  for (const d of lastDays(days)) buckets.set(d, { requests: 0, chars: 0, errors: 0 });
  for (const e of window) {
    const b = buckets.get(dayKey(e.ts));
    if (b) {
      b.requests += 1;
      b.chars += e.chars;
    }
  }
  for (const e of errWindow) {
    const b = buckets.get(dayKey(e.ts));
    if (b) b.errors += 1;
  }
  return lastDays(days).map((d) => ({ date: d, ...buckets.get(d)! }));
}

export function getKeysUsage(days: number) {
  const map = new Map<string, { keyId: string | null; keyName: string; requests: number; chars: number; errors: number }>();
  for (const e of usage) {
    if (!inWindow(e.ts, days)) continue;
    const id = e.keyId ?? "__admin__";
    const m = map.get(id) ?? {
      keyId: e.keyId,
      keyName: e.keyName ?? "admin (dashboard)",
      requests: 0,
      chars: 0,
      errors: 0,
    };
    m.requests += 1;
    m.chars += e.chars;
    map.set(id, m);
  }
  const errMap = new Map<string, number>();
  for (const e of errors) {
    if (!inWindow(e.ts, days)) continue;
    const id = e.keyId ?? "__admin__";
    errMap.set(id, (errMap.get(id) ?? 0) + 1);
  }
  return [...map.values()]
    .map((m) => ({ ...m, errors: errMap.get(m.keyId ?? "__admin__") ?? 0 }))
    .sort((a, b) => b.chars - a.chars || b.requests - a.requests);
}

export function getKeySeries(id: string, days: number) {
  const buckets = new Map<string, { requests: number; chars: number; errors: number }>();
  for (const d of lastDays(days)) buckets.set(d, { requests: 0, chars: 0, errors: 0 });
  for (const e of usage) {
    if (!inWindow(e.ts, days)) continue;
    if (e.keyId !== id) continue;
    const b = buckets.get(dayKey(e.ts));
    if (b) {
      b.requests += 1;
      b.chars += e.chars;
    }
  }
  for (const e of errors) {
    if (!inWindow(e.ts, days)) continue;
    if (e.keyId !== id) continue;
    const b = buckets.get(dayKey(e.ts));
    if (b) b.errors += 1;
  }
  return lastDays(days).map((d) => ({ date: d, ...buckets.get(d)! }));
}

export function getRequestLogs(opts: { limit: number; keyId?: string; account?: string; status?: string; path?: string }) {
  let rows = [...usage];
  if (opts.keyId) rows = rows.filter((r) => r.keyId === opts.keyId);
  if (opts.account) rows = rows.filter((r) => (r.accountLabel ?? "").toLowerCase().includes(opts.account!.toLowerCase()));
  if (opts.status) rows = rows.filter((r) => String(r.status) === opts.status);
  if (opts.path) rows = rows.filter((r) => r.path.toLowerCase().includes(opts.path!.toLowerCase()));
  rows.sort((a, b) => b.ts - a.ts);
  return rows.slice(0, opts.limit);
}

export function getErrorLogs(limit: number) {
  return [...errors].sort((a, b) => b.ts - a.ts).slice(0, limit);
}

export function getLastErrorForAccount(accountId: string): ErrorEntry | null {
  for (let i = errors.length - 1; i >= 0; i--) {
    if (errors[i].accountId === accountId) return errors[i];
  }
  return null;
}

export function getLastUsageForAccount(accountId: string): UsageEntry | null {
  for (let i = usage.length - 1; i >= 0; i--) {
    if (usage[i].accountId === accountId) return usage[i];
  }
  return null;
}

export function countErrorsForAccount(accountId: string, windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  let n = 0;
  for (const e of errors) {
    if (e.accountId === accountId && e.ts >= cutoff) n += 1;
  }
  return n;
}

export function clearLogs() {
  usage = [];
  errors = [];
  ensureDir();
  try {
    fs.writeFileSync(USAGE_FILE, JSON.stringify([]));
    fs.writeFileSync(ERRORS_FILE, JSON.stringify([]));
  } catch {
    // ignore
  }
}
