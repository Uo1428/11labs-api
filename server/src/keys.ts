import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ADMIN_KEY, API_KEYS_FILE } from "./config";
import type { ApiKey, ApiKeyView } from "./types";

const ADMIN_KEY_FILE = path.join(path.dirname(API_KEYS_FILE), "admin.key");

let apiKeys: ApiKey[] = [];
let adminKey: string = ADMIN_KEY;

export type Principal =
  | { role: "admin" }
  | { role: "key"; key: ApiKey };

function ensureDir() {
  fs.mkdirSync(path.dirname(API_KEYS_FILE), { recursive: true });
}

function safeEqual(a: string, b: string) {
  const ah = crypto.createHash("sha256").update(a).digest();
  const bh = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ah, bh);
}

function loadApiKeys() {
  ensureDir();
  if (!fs.existsSync(API_KEYS_FILE)) return;
  try {
    apiKeys = JSON.parse(fs.readFileSync(API_KEYS_FILE, "utf8"));
  } catch {
    apiKeys = [];
  }
}

function saveApiKeys() {
  ensureDir();
  fs.writeFileSync(API_KEYS_FILE, JSON.stringify(apiKeys, null, 2));
}

/**
 * Resolve the effective admin key. Prefers the ADMIN_KEY env var.
 * If unset, generates a random key once, persists it to data/admin.key and
 * logs it so the operator can still get in.
 */
function ensureAdminKey() {
  if (adminKey) return;
  ensureDir();
  try {
    const file = fs.readFileSync(ADMIN_KEY_FILE, "utf8").trim();
    if (file) {
      adminKey = file;
      return;
    }
  } catch {
    // fall through to generation
  }
  const generated = crypto.randomBytes(32).toString("hex");
  adminKey = generated;
  try {
    fs.writeFileSync(ADMIN_KEY_FILE, generated, { mode: 0o600 });
    console.log(`\n[admin] ADMIN_KEY not set. Generated one and saved it to ${ADMIN_KEY_FILE}`);
    console.log(`[admin] use this key to log into the dashboard: ${generated}\n`);
  } catch (e) {
    console.log(`[admin] ADMIN_KEY not set. Generated temporary key: ${generated}`);
  }
}

export function init() {
  ensureAdminKey();
  loadApiKeys();
}

export function adminKeyHint() {
  return adminKey ? `${adminKey.slice(0, 6)}...${adminKey.slice(-4)}` : "(unset)";
}

export function verifyAdminKey(candidate?: string) {
  return !!candidate && safeEqual(candidate, adminKey);
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function toView(k: ApiKey): ApiKeyView {
  const { keyHash: _kh, ...rest } = k;
  return rest;
}

export function listApiKeys(): ApiKeyView[] {
  return apiKeys.map(toView);
}

export function getApiKey(id: string): ApiKey | undefined {
  return apiKeys.find((k) => k.id === id);
}

export function createApiKey(name?: string): ApiKeyView & { token: string } {
  const token = "llk_" + crypto.randomBytes(24).toString("base64url");
  const record: ApiKey = {
    id: "key_" + crypto.randomUUID().replace(/-/g, "").slice(0, 10),
    name: name?.trim() || `Key ${apiKeys.length + 1}`,
    keyHash: hashToken(token),
    hint: `${token.slice(0, 9)}...${token.slice(-4)}`,
    active: true,
    createdAt: Date.now(),
    lastUsedAt: null,
  };
  apiKeys.push(record);
  saveApiKeys();
  return { ...toView(record), token };
}

export function updateApiKey(
  id: string,
  patch: Partial<Pick<ApiKey, "name" | "active">>,
): ApiKeyView | null {
  const k = getApiKey(id);
  if (!k) return null;
  if (patch.name !== undefined) k.name = patch.name.trim() || k.name;
  if (patch.active !== undefined) k.active = patch.active;
  saveApiKeys();
  return toView(k);
}

export function deleteApiKey(id: string) {
  apiKeys = apiKeys.filter((k) => k.id !== id);
  saveApiKeys();
}

export function findApiKeyByToken(token: string): ApiKey | undefined {
  if (!token) return undefined;
  const hash = hashToken(token);
  for (const k of apiKeys) {
    if (safeEqual(k.keyHash, hash)) return k;
  }
  return undefined;
}

let lastMarked = 0;
export function markKeyUsed(id: string) {
  const now = Date.now();
  if (now - lastMarked < 60_000) return;
  const k = getApiKey(id);
  if (!k) return;
  lastMarked = now;
  k.lastUsedAt = now;
  saveApiKeys();
}

export function authenticate(req: { get: (h: string) => string | undefined }): Principal | null {
  const admin = req.get("x-admin-key");
  if (admin && verifyAdminKey(admin)) return { role: "admin" };

  const token = req.get("x-api-key");
  if (token) {
    const k = findApiKeyByToken(token);
    if (k) {
      if (!k.active) return null;
      markKeyUsed(k.id);
      return { role: "key", key: k };
    }
  }
  return null;
}
