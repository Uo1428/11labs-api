import { useState } from "react";
import { api } from "../api";
import type { Account } from "../types";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Input } from "./ui/input";
import { AnimatedBadge } from "./ui/animated-badge";
import { AnimatedNumber } from "./ui/animated-number";
import { motion } from "motion/react";
import { Plus, UserRound, WalletCards } from "lucide-react";
import { SPRING_LAYOUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

function pct(used: number, limit: number) {
  return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
}

interface Props {
  accounts: Account[];
  accountMode: string;
  onSelect: (id: string) => void;
  onChanged: () => void;
}

export function Sidebar({ accounts, accountMode, onSelect, onChanged }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addAccount() {
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api("/accounts", { method: "POST", body: { label, refreshToken: token } });
      setToken("");
      setLabel("");
      setShowAdd(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(a: Account) {
    await api(`/accounts/${a.id}`, { method: "PATCH", body: { active: !a.active } });
    onChanged();
  }

  async function removeAccount(a: Account) {
    await api(`/accounts/${a.id}`, { method: "DELETE" });
    if (accountMode === a.id) onSelect("auto");
    onChanged();
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-background">
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary">
            <WalletCards className="h-4 w-4" />
          </span>
          <h1 className="text-sm font-semibold tracking-wide text-foreground">Accounts</h1>
        </div>
        <Button size="icon" variant="secondary" onClick={() => setShowAdd(true)} aria-label="Add account">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-2 overflow-auto px-3 pb-3">
        {accounts.map((a) => (
          <AccountCard
            key={a.id}
            account={a}
            selected={accountMode === a.id}
            onSelect={onSelect}
            onToggle={toggleActive}
            onRemove={removeAccount}
          />
        ))}
        {accounts.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            <UserRound className="h-5 w-5 opacity-60" />
            <span>
              No accounts yet.
              <br />
              Add one to get started.
            </span>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="space-y-3 border-t border-border p-4">
          <p className="text-xs font-medium text-muted-foreground">New account</p>
          <Input
            value={label}
            onChange={setLabel}
            placeholder="Label (optional)"
            aria-label="Label"
          />
          <div>
            <Input
              value={token}
              onChange={setToken}
              placeholder="Firebase refresh token"
              error={error ?? undefined}
            />
            {error && !token ? (
              <p className="mt-1 px-1 text-xs text-destructive">{error}</p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button onClick={addAccount} disabled={busy || !token.trim()} size="sm" className="flex-1">
              Add account
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}

function AccountCard({
  account,
  selected,
  onSelect,
  onToggle,
  onRemove,
}: {
  account: Account;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggle: (a: Account) => void;
  onRemove: (a: Account) => void;
}) {
  const a = account;
  return (
    <motion.div
      layout
      transition={SPRING_LAYOUT}
      onClick={() => onSelect(a.id)}
      className={cn(
        "group relative cursor-pointer rounded-2xl border bg-card p-3 transition-colors",
        selected ? "border-primary/50 bg-primary/5" : "border-border hover:border-border-strong",
        !a.active && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{a.label}</p>
          {a.email && <p className="truncate text-xs text-muted-foreground">{a.email}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            onClick={(e) => e.stopPropagation()}
            role="button"
            tabIndex={-1}
          >
            <Switch
              checked={a.active}
              onCheckedChange={() => onToggle(a)}
              ariaLabel={a.active ? "Disable account" : "Enable account"}
            />
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(a);
            }}
            className="text-xs text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
            title="Delete account"
          >
            ✕
          </button>
        </div>
      </div>

      {a.subscription ? (
        <div className="mt-2.5">
          <div className="flex items-center justify-between gap-2">
            <AnimatedBadge status={a.subscription.remaining < 500 ? "danger" : a.subscription.remaining < 5000 ? "warning" : "success"} size="sm" showIcon={false}>
              {a.subscription.tier}
            </AnimatedBadge>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              <AnimatedNumber value={a.subscription.remaining} format={(n) => `${n.toLocaleString()} left`} />
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                a.subscription.remaining < 500
                  ? "bg-destructive"
                  : a.subscription.remaining < 5000
                    ? "bg-amber-500"
                    : "bg-primary",
              )}
              style={{ width: `${pct(a.subscription.used, a.subscription.limit)}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground/70">subscription unavailable</p>
      )}
    </motion.div>
  );
}