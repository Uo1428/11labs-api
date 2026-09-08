import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { AccountHealth } from "../types";
import { Button } from "./ui/button";
import { AnimatedBadge } from "./ui/animated-badge";
import { motion } from "motion/react";
import { Activity, HeartPulse, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return (
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

function pct(used: number, limit: number) {
  return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
}

function rel(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function TokenBadge({ token }: { token: AccountHealth["token"] }) {
  if (token === "valid")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-500">
        <span className="size-1.5 rounded-full bg-emerald-500" /> token ok
      </span>
    );
  if (token === "expired")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-500">
        <span className="size-1.5 rounded-full bg-amber-500" /> token expired
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
      <span className="size-1.5 rounded-full bg-muted-foreground/50" /> token idle
    </span>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        {label}
      </p>
      <p className={cn("mt-0.5 truncate text-sm font-semibold tabular-nums", tone ?? "text-foreground")}>
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">{sub}</p>}
    </div>
  );
}

export function HealthTab() {
  const [accounts, setAccounts] = useState<AccountHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await (await api("/admin/health")).json()) as AccountHealth[];
      setAccounts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  async function forceRefresh(id: string) {
    setRefreshing(id);
    setError(null);
    try {
      await api(`/admin/accounts/${id}/refresh`, { method: "POST" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(null);
      refresh();
    }
  }

  const unhealthy = accounts.filter(
    (a) => a.active && (a.token === "expired" || (a.subscription?.remaining ?? 0) < 500),
  ).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Account health</h2>
          <AnimatedBadge status={unhealthy ? "warning" : "info"} size="sm" showIcon={false}>
            {unhealthy ? `${unhealthy} need attention` : `${accounts.length} accounts healthy`}
          </AnimatedBadge>
        </div>
        <Button variant="secondary" size="sm" onClick={refresh}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </header>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">{error}</p>
      )}

      {loading && accounts.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading health…
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center text-xs text-muted-foreground">
          <Activity className="h-5 w-5 opacity-60" />
          No accounts configured. Add one in the sidebar.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((a, i) => {
            const sub = a.subscription;
            const remaining = sub?.remaining;
            const usedPct = sub ? pct(sub.used, sub.limit) : 0;
            const attention = a.active && (a.token === "expired" || (remaining ?? 0) < 500);
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={cn(
                  "overflow-hidden rounded-2xl border bg-card transition-colors",
                  attention ? "border-destructive/30" : "border-border",
                  !a.active && "opacity-55 saturate-50",
                )}
              >
                {/* header */}
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-muted text-xs font-semibold text-foreground"
                  >
                    {initials(a.label)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{a.label}</p>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                          a.active
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <span className={cn("size-1 rounded-full", a.active ? "bg-emerald-500" : "bg-muted-foreground/60")} />
                        {a.active ? "Active" : "Paused"}
                      </span>
                    </div>
                    {a.email && <p className="truncate text-[11px] text-muted-foreground">{a.email}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <TokenBadge token={a.token} />
                    <button
                      onClick={() => forceRefresh(a.id)}
                      disabled={refreshing === a.id}
                      className="grid size-7 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
                      title="Force refresh token & validate"
                      aria-label={`Force refresh token for ${a.label}`}
                    >
                      {refreshing === a.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* credits */}
                <div className="px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                      Credits remaining
                    </span>
                    {remaining !== undefined ? (
                      <span className="text-sm font-semibold tabular-nums text-foreground">
                        {remaining.toLocaleString()}
                        <span className="text-[11px] font-normal text-muted-foreground/60">
                          {" "}/ {sub!.limit.toLocaleString()}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">unavailable</span>
                    )}
                  </div>

                  {sub ? (
                    <>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          initial={false}
                          animate={{ width: `${usedPct}%` }}
                          transition={{ type: "spring", stiffness: 180, damping: 30 }}
                          className={cn(
                            "h-full rounded-full",
                            remaining! < 500
                              ? "bg-destructive"
                              : remaining! < 5000
                                ? "bg-amber-500"
                                : "bg-primary",
                          )}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <AnimatedBadge
                          status={remaining! < 500 ? "danger" : remaining! < 5000 ? "warning" : "success"}
                          size="sm"
                          showIcon={false}
                        >
                          {sub.tier}
                        </AnimatedBadge>
                        <span className="text-[10px] text-muted-foreground/70">
                          {sub.used.toLocaleString()} used
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-[11px] text-muted-foreground/70">subscription unavailable</p>
                  )}
                </div>

                {/* metrics */}
                <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
                  <Metric
                    label="Errors / 24h"
                    value={String(a.errors24h)}
                    tone={a.errors24h > 0 ? "text-destructive" : "text-emerald-500"}
                  />
                  <Metric
                    label="Last used"
                    value={a.lastUsed ? rel(a.lastUsed.ts) : "—"}
                    sub={a.lastUsed ? a.lastUsed.path : undefined}
                  />
                  <Metric
                    label="Last call"
                    value={a.lastUsed?.chars ? `${a.lastUsed.chars} chars` : "—"}
                    tone={a.lastUsed?.chars ? "text-foreground" : "text-muted-foreground/50"}
                  />
                </div>

                {a.lastError && (
                  <div className="flex items-start gap-2 border-t border-destructive/20 bg-destructive/[0.06] px-4 py-2.5">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                    <p className="min-w-0 text-[11px] leading-snug text-muted-foreground">
                      <span className="font-mono font-semibold text-destructive">{a.lastError.status}</span>{" "}
                      <span className="text-foreground/90">{a.lastError.message}</span>
                      <span className="ml-1 text-muted-foreground/60">· {rel(a.lastError.ts)}</span>
                    </p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}