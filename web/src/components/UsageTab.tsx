import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { UsageDay, KeyUsage, RequestLog, ErrorLog } from "../types";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { AnimatedBadge } from "./ui/animated-badge";
import { motion } from "motion/react";
import { ChevronDown, KeyRound, Loader2, RefreshCw, ScrollText, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const DAY_OPTIONS = [7, 14, 30];

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString();
}

function fmtNum(n: number) {
  return n.toLocaleString();
}

function BarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-32 items-end gap-1">
      {data.map((d, i) => {
        const h = d.value === 0 ? 2 : Math.max(3, (d.value / max) * 100);
        return (
          <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              className="w-full rounded-t-sm transition-all group-hover:opacity-80"
              style={{ height: `${h}%`, background: color, opacity: d.value === 0 ? 0.15 : 1 }}
            />
            <span className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background opacity-0 transition-opacity group-hover:opacity-100">
              {fmtNum(d.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ChartCard({ title, data, color, unit }: { title: string; data: { label: string; value: number }[]; color: string; unit: (n: number) => string }) {
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <span className="text-sm font-semibold tabular-nums text-foreground">{unit(max)}</span>
      </div>
      <BarChart
        color={color}
        data={data.map((d) => ({ label: d.label, value: d.value }))}
      />
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground/70">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

const METHOD_STYLE: Record<string, string> = {
  GET: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  POST: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  PATCH: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  DELETE: "bg-destructive/15 text-destructive",
};

function StatusBadge({ status }: { status: number }) {
  const tone =
    status < 300 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    : status < 400 ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
    : status < 500 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
    : "bg-destructive/15 text-destructive";
  return (
    <span className={cn("inline-flex h-5 min-w-9 items-center justify-center rounded-md px-1.5 font-mono text-[11px] font-semibold", tone)}>
      {status}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 font-mono text-[11px] font-semibold", METHOD_STYLE[method] ?? "bg-muted text-muted-foreground")}>
      {method}
    </span>
  );
}

type LogFilter = "all" | "2xx" | "4xx" | "5xx";

export function UsageTab() {
  const [days, setDays] = useState(14);
  const [overview, setOverview] = useState<UsageDay[]>([]);
  const [keys, setKeys] = useState<KeyUsage[]>([]);
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LogFilter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, ks, lg, er] = await Promise.all([
        (await api(`/usage/overview?days=${days}`)).json(),
        (await api(`/usage/keys?days=${days}`)).json(),
        (await api(`/logs?limit=200`)).json(),
        (await api(`/errors?limit=50`)).json(),
      ]);
      setOverview(ov as UsageDay[]);
      setKeys(ks as KeyUsage[]);
      setLogs(lg as RequestLog[]);
      setErrors(er as ErrorLog[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totals = useMemo(() => {
    return overview.reduce(
      (a, d) => ({ requests: a.requests + d.requests, chars: a.chars + d.chars, errors: a.errors + d.errors }),
      { requests: 0, chars: 0, errors: 0 },
    );
  }, [overview]);

  const filteredLogs = useMemo(() => {
    const q = search.toLowerCase();
    return logs.filter((l) => {
      if (status === "2xx" && (l.status < 200 || l.status >= 300)) return false;
      if (status === "4xx" && (l.status < 400 || l.status >= 500)) return false;
      if (status === "5xx" && l.status < 500) return false;
      if (q) {
        const hay = `${l.method} ${l.path} ${l.keyName ?? ""} ${l.accountLabel ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, status, search]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Usage &amp; Observability</h2>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))} className="w-32">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  Last {d} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="secondary" size="sm" onClick={refresh}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </header>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">{error}</p>
      )}

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Requests" value={fmtNum(totals.requests)} tone="text-sky-500" />
        <StatCard label="Characters generated" value={fmtNum(totals.chars)} tone="text-primary" />
        <StatCard label="Errors" value={fmtNum(totals.errors)} tone={totals.errors ? "text-destructive" : "text-emerald-500"} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Requests / day" data={overview.map((d) => ({ label: d.date, value: d.requests }))} color="var(--color-primary)" unit={(n) => fmtNum(n)} />
        <ChartCard title="Characters / day" data={overview.map((d) => ({ label: d.date, value: d.chars }))} color="var(--color-primary)" unit={(n) => fmtNum(n)} />
      </div>

      {/* Top keys */}
      <section className="space-y-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <KeyRound className="h-4 w-4 text-primary" /> Top keys
        </h3>
        {keys.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No usage yet.</p>
        ) : (
          keys.map((k, i) => {
            const maxChars = Math.max(1, ...keys.map((x) => x.chars));
            return (
              <motion.div
                key={k.keyId ?? "admin"}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">{i + 1}</span>
                    <p className="text-sm font-medium text-foreground">{k.keyName}</p>
                    {k.keyId === null && <AnimatedBadge status="neutral" size="sm" showIcon={false}>admin</AnimatedBadge>}
                  </div>
                  <div className="flex gap-3 text-[11px] text-muted-foreground">
                    <span>{fmtNum(k.chars)} chars</span>
                    <span>{fmtNum(k.requests)} req</span>
                    {k.errors > 0 && <span className="text-destructive">{k.errors} errors</span>}
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(k.chars / maxChars) * 100}%` }} />
                </div>
              </motion.div>
            );
          })
        )}
      </section>

      {/* Request log */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ScrollText className="h-4 w-4 text-primary" /> Request log
          </h3>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter path / key / account"
              className="h-8 w-52 rounded-full border border-border bg-card px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
            />
            <Select value={status} onValueChange={(v) => setStatus(v as LogFilter)} className="w-24">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="2xx">2xx</SelectItem>
                <SelectItem value="4xx">4xx</SelectItem>
                <SelectItem value="5xx">5xx</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          {filteredLogs.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">No matching requests.</p>
          ) : (
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">Path</th>
                  <th className="px-3 py-2 font-medium">Key</th>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 text-right font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Chars</th>
                  <th className="px-3 py-2 text-right font-medium">ms</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((l, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtTime(l.ts)}</td>
                    <td className="px-3 py-2"><MethodBadge method={l.method} /></td>
                    <td className="max-w-56 truncate px-3 py-2 font-mono text-foreground/80">{l.path}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.keyName ?? <span className="text-muted-foreground/60">admin</span>}</td>
                    <td className="max-w-40 truncate px-3 py-2 text-muted-foreground">{l.accountLabel ?? "—"}</td>
                    <td className="px-3 py-2 text-right"><StatusBadge status={l.status} /></td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{l.chars || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{l.ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Errors */}
      <section className="space-y-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <TriangleAlert className="h-4 w-4 text-destructive" /> Recent errors
          <AnimatedBadge status={errors.length ? "danger" : "success"} size="sm" showIcon={false}>
            {errors.length}
          </AnimatedBadge>
        </h3>
        {errors.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No recorded errors.</p>
        ) : (
          errors.map((e, i) => {
            const open = expanded === String(i);
            return (
              <div key={i} className="overflow-hidden rounded-2xl border border-destructive/25 bg-card">
                <button
                  onClick={() => setExpanded(open ? null : String(i))}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left"
                >
                  <StatusBadge status={e.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{e.message}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {fmtTime(e.ts)} · <span className="font-mono">{e.method} {e.path}</span>
                      {e.keyName ? ` · ${e.keyName}` : " · admin"}
                      {e.accountLabel ? ` · ${e.accountLabel}` : ""}
                    </p>
                  </div>
                  <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                </button>
                {open && e.stack && (
                  <pre className="max-h-64 overflow-auto border-t border-border bg-muted/30 p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {e.stack}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}
