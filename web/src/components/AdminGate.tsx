import { useState } from "react";
import { motion } from "motion/react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

export function AdminGate({
  onLogin,
  error,
  busy,
}: {
  onLogin: (key: string) => Promise<boolean>;
  error: string | null;
  busy: boolean;
}) {
  const [key, setKey] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    await onLogin(key.trim());
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <motion.div
        initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="w-full max-w-sm"
      >
        <form
          onSubmit={submit}
          className="space-y-5 rounded-3xl border border-border bg-card p-7 shadow-xl"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-base font-semibold text-foreground">Restricted dashboard</h1>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Enter the admin key to unlock account management and proxy usage.
              </p>
            </div>
          </div>

          <div>
            <Input
              type="password"
              value={key}
              onChange={setKey}
              placeholder="Admin key"
              autoFocus
              disabled={busy}
              leftIcon={<KeyRound className="h-4 w-4" />}
              error={error ?? undefined}
              reserveErrorLine
            />
          </div>

          <Button type="submit" disabled={busy || !key.trim()} className="w-full" size="lg">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {busy ? "Verifying…" : "Unlock"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
