import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ACCOUNTS_FILE } from "./config";
import type { Account } from "./types";

let accounts: Account[] = [];

function ensureDir() {
  fs.mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true });
}

export function load() {
  ensureDir();
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    accounts = [];
    return;
  }
  try {
    accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
  } catch {
    accounts = [];
  }
  // Backfill missing labels from older data.
  let dirty = false;
  for (const a of accounts) {
    if (!a.label) {
      a.label = a.email || `Account ${accounts.indexOf(a) + 1}`;
      dirty = true;
    }
  }
  if (dirty) save();
}

export function save() {
  ensureDir();
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
}

export function listAccounts(): Account[] {
  return accounts;
}

export function getAccount(id: string): Account | undefined {
  return accounts.find((a) => a.id === id);
}

export function addAccount(input: { label?: string; refreshToken: string }): Account {
  const account: Account = {
    id: "acct_" + crypto.randomUUID().replace(/-/g, "").slice(0, 10),
    label: input.label?.trim() || "Account " + (accounts.length + 1),
    refreshToken: input.refreshToken.trim(),
    active: true,
    createdAt: Date.now(),
  };
  accounts.push(account);
  save();
  return account;
}

export function updateAccount(
  id: string,
  patch: Partial<Pick<Account, "label" | "active" | "email">>,
): Account | null {
  const a = getAccount(id);
  if (!a) return null;
  Object.assign(a, patch);
  save();
  return a;
}

export function deleteAccount(id: string) {
  accounts = accounts.filter((a) => a.id !== id);
  save();
}