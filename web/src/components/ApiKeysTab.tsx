import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { ApiKey, CreatedApiKey } from "../types";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Input } from "./ui/input";
import { AnimatedBadge } from "./ui/animated-badge";
import { StatefulButton } from "./ui/stateful-button";
import { motion } from "motion/react";
import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { SPRING_LAYOUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

function fmtDate(ts: number | null) {
  if (!ts) return "never";
  return new Date(ts).toLocaleString();
}

export function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [createState, setCreateState] = useState<"idle" | "loading">("idle");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await (await api("/api-keys")).json();
      setKeys(data as ApiKey[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function create() {
    setCreateState("loading");
    setError(null);
    try {
      const data = (await (
        await api("/api-keys", { method: "POST", body: { name } })
      ).json()) as CreatedApiKey;
      setCreated(data);
      setName("");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateState("idle");
    }
  }

  async function toggle(k: ApiKey) {
    await api(`/api-keys/${k.id}`, { method: "PATCH", body: { active: !k.active } });
    refresh();
  }

  async function remove(k: ApiKey) {
    await api(`/api-keys/${k.id}`, { method: "DELETE" });
    refresh();
  }

  async function copyToken() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">API Keys</h2>
          <AnimatedBadge status="info" size="sm">
            {keys.length} keys
          </AnimatedBadge>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Issue keys so external apps can call the proxy (voices, TTS, history) without an
          admin key. Send the key in the{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">x-api-key</code>{" "}
          header. The full token is shown only once.
        </p>
      </header>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Input
              value={name}
              onChange={setName}
              placeholder="Key name (optional)"
              aria-label="Key name"
              label="New key"
            />
          </div>
          <StatefulButton
            onClick={create}
            state={createState}
            disabled={createState === "loading"}
            loadingText="Creating"
            successText="Created"
            icon={<Plus className="h-4 w-4" />}
          >
            Create key
          </StatefulButton>
        </div>

        {created && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4"
          >
            <p className="text-xs font-medium text-foreground">
              Copy this key now — it won't be shown again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
                {created.token}
              </code>
              <Button variant="secondary" size="sm" onClick={copyToken} className="shrink-0">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-muted-foreground"
              onClick={() => setCreated(null)}
            >
              Dismiss
            </Button>
          </motion.div>
        )}
      </section>

      <section className="space-y-2.5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Loading keys…
          </div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
            <KeyRound className="h-5 w-5 opacity-60" />
            No API keys yet. Create one to let external apps use the proxy.
          </div>
        ) : (
          keys.map((k) => (
            <motion.div
              key={k.id}
              layout
              transition={SPRING_LAYOUT}
              className={cn(
                "rounded-2xl border border-border bg-card p-4 transition-opacity",
                !k.active && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{k.name}</p>
                    <AnimatedBadge
                      status={k.active ? "success" : "neutral"}
                      size="sm"
                      showIcon={false}
                    >
                      {k.active ? "active" : "disabled"}
                    </AnimatedBadge>
                  </div>
                  <code className="mt-1 block font-mono text-[11px] text-muted-foreground">
                    {k.hint}
                  </code>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Created {fmtDate(k.createdAt)} · Last used {fmtDate(k.lastUsedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Switch
                    checked={k.active}
                    onCheckedChange={() => toggle(k)}
                    ariaLabel={k.active ? "Disable key" : "Enable key"}
                  />
                  <button
                    onClick={() => remove(k)}
                    className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                    title="Delete key"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </section>
    </div>
  );
}
