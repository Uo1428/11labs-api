export interface Subscription {
  tier: string;
  used: number;
  limit: number;
  remaining: number;
  resetUnix: number;
  currency: string;
  status: string;
}

export interface Account {
  id: string;
  label: string;
  email?: string;
  active: boolean;
  createdAt: number;
  subscription: Subscription | null;
}

export interface ApiKey {
  id: string;
  name: string;
  /** Display fragment like `llk_ab12...wxyz`; full token only shown once at creation. */
  hint: string;
  active: boolean;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface CreatedApiKey extends ApiKey {
  token: string;
}

export interface UsageDay {
  date: string;
  requests: number;
  chars: number;
  errors: number;
}

export interface KeyUsage {
  keyId: string | null;
  keyName: string;
  requests: number;
  chars: number;
  errors: number;
}

export interface RequestLog {
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

export interface ErrorLog {
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

export interface AccountHealth {
  id: string;
  label: string;
  email: string | null;
  active: boolean;
  subscription: Subscription | null;
  token: "valid" | "expired" | "none";
  errors24h: number;
  lastError: { ts: number; status: number; message: string } | null;
  lastUsed: { ts: number; path: string; chars: number } | null;
}

export interface Voice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
  verified_languages?: { language: string; model_id: string }[];
  description?: string;
}

export interface HistoryItem {
  history_item_id: string;
  text: string | null;
  voice_id: string | null;
  voice_name: string | null;
  model_id: string;
  date_unix: number;
  state: string;
  content_type: string;
  character_count_change_to: number;
  settings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    speed?: number;
    use_speaker_boost?: boolean;
  };
  output_format?: string;
}

export interface SharedVoice {
  voice_id: string;
  name: string;
  description?: string;
  gender?: string;
  age?: string;
  accent?: string;
  language?: string;
  use_case?: string;
  category?: string;
  preview_url?: string;
}