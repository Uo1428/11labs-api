import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PORT = Number(process.env.PORT ?? 8787);
export const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY ?? "AIzaSyBSsRE_1Os04-bxpd5JTLIniy3UK4OqKys";
export const UPSTREAM_BASE = process.env.UPSTREAM_BASE ?? "https://api.us.elevenlabs.io";
export const ACCOUNTS_FILE = process.env.ACCOUNTS_FILE ?? path.join(ROOT, "data", "accounts.json");
export const ADMIN_KEY = process.env.ADMIN_KEY ?? "";
export const API_KEYS_FILE = process.env.API_KEYS_FILE ?? path.join(ROOT, "data", "api-keys.json");
export const USAGE_FILE = process.env.USAGE_FILE ?? path.join(ROOT, "data", "usage.json");
export const ERRORS_FILE = process.env.ERRORS_FILE ?? path.join(ROOT, "data", "errors.json");