export interface Account {
  id: string;
  label: string;
  email?: string;
  refreshToken: string;
  active: boolean;
  createdAt: number;
}

export interface SubscriptionInfo {
  tier: string;
  used: number;
  limit: number;
  remaining: number;
  resetUnix: number;
  currency: string;
  status: string;
}

export type AccountView = Omit<Account, "refreshToken"> & {
  subscription: SubscriptionInfo | null;
};

export interface ApiKey {
  id: string;
  name: string;
  /** sha256 hex of the raw token. The raw token is only ever returned once at creation. */
  keyHash: string;
  /** Display-only fragment like `llk_ab12...wxyz`. */
  hint: string;
  active: boolean;
  createdAt: number;
  lastUsedAt: number | null;
}

export type ApiKeyView = Omit<ApiKey, "keyHash">;

export interface UsageEntry {
  ts: number;
  keyId: string | null;
  keyName: string | null;
  method: string;
  path: string;
  accountId: string | null;
  accountLabel: string | null;
  status: number;
  chars: number;
  ms: number;
}

export interface ErrorEntry {
  ts: number;
  keyId: string | null;
  keyName: string | null;
  method: string;
  path: string;
  accountId: string | null;
  accountLabel: string | null;
  status: number;
  message: string;
  stack?: string;
}