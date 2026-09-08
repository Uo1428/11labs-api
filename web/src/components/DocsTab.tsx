import { useState } from "react";
import { AnimatedBadge } from "./ui/animated-badge";
import { Button } from "./ui/button";
import { motion } from "motion/react";
import { Check, Copy, FileCode2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE } from "../api";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

interface Endpoint {
  method: Method;
  path: string;
  name: string;
  desc: string;
  request?: string;
  response: string;
  body?: string;
  query?: string;
  headers?: string;
}

const AUTH_NOTES = `Authenticate every request with an API key from the "API Keys" tab:

  Header:  x-api-key: <your-api-key>
  (Admin key x-admin-key is for the dashboard only - don't ship it to clients.)

Then tell the proxy which account to use via the x-account header:

  "auto"  -> proxy picks the best account (based on text length & credits)
  "ID"    -> a specific account id (shown in the sidebar)

Fetch from the same origin (e.g. https://your-app.com) or point a reverse
proxy to the backend. Vite dev proxies /api automatically.`;

const ENDPOINTS: Endpoint[] = [
  {
    method: "GET",
    path: "/api/me",
    name: "Account profile",
    desc: "Returns the currently resolved account's ElevenLabs profile.",
    headers: `x-api-key: <your-api-key>
x-account: auto`,
    response: `{
  "email": "user@example.com",
  "first_name": "Ada",
  "subscription": { "tier": "creator", "character_count": 123456 }
}`,
  },
  {
    method: "GET",
    path: "/api/subscription",
    name: "Subscription & credits",
    desc: "Credit balance for the resolved account. Handy for gating UI.",
    headers: `x-api-key: <your-api-key>
x-account: auto`,
    response: `{
  "tier": "creator",
  "used": 12345,
  "limit": 200000,
  "remaining": 187655,
  "resetUnix": 1728000000,
  "currency": "usd",
  "status": "active"
}`,
  },
  {
    method: "GET",
    path: "/api/voices",
    name: "Your voices",
    desc: "Lists the voices available on the resolved account.",
    headers: `x-api-key: <your-api-key>
x-account: auto`,
    response: `{
  "voices": [
    { "voice_id": "pNInz6obpgDQGcFmaJgB", "name": "Adam", "category": "premade" }
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/voices/:id/settings",
    name: "Voice settings",
    desc: "Stability / similarity settings for a single voice.",
    headers: `x-api-key: <your-api-key>
x-account: auto`,
    response: `{
  "stability": 0.5,
  "similarity_boost": 0.75,
  "style": 0,
  "use_speaker_boost": false
}`,
  },
  {
    method: "GET",
    path: "/api/shared-voices",
    name: "Community voices",
    desc: "Browse the ElevenLabs community voice library.",
    query: `?sort=trending&page=1&page_size=30`,
    headers: `x-api-key: <your-api-key>
x-account: auto`,
    response: `{
  "voices": [
    {
      "voice_id": "XB0fDUnXU5powFXDhCwa",
      "name": "Charlotte",
      "preview_url": "https://.../preview.mp3"
    }
  ],
  "has_more": true
}`,
  },
  {
    method: "POST",
    path: "/api/tts/:voiceId/stream",
    name: "Text-to-speech (stream)",
    desc: "Generate speech and stream the audio back in one call. This is the main endpoint.",
    headers: `x-api-key: <your-api-key>
x-account: auto`,
    request: `POST /api/tts/{voiceId}/stream
Content-Type: application/json

{
  "text": "Hello from ElevenLabs",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": { "stability": 0.5, "similarity_boost": 0.75 }
}`,
    response: `audio/mpeg stream

Response headers:
  x-account-id       -> account that served it
  x-character-cost   -> credits consumed
  x-credit-remaining -> balance after this call`,
  },
  {
    method: "GET",
    path: "/api/history",
    name: "Generation history",
    desc: "Recent TTS generations for the resolved account.",
    query: `?page_size=20`,
    headers: `x-api-key: <your-api-key>
x-account: auto`,
    response: `{
  "history": [
    {
      "history_item_id": "abc123",
      "text": "Hello",
      "voice_id": "pNInz6obpgDQGcFmaJgB",
      "state": "completed"
    }
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/history/:id/audio",
    name: "History audio",
    desc: "Fetch the audio bytes for a previously generated item.",
    headers: `x-api-key: <your-api-key>
x-account: auto`,
    response: `audio/mpeg`,
  },
  {
    method: "DELETE",
    path: "/api/history/:id",
    name: "Delete history",
    desc: "Remove a history item.",
    headers: `x-api-key: <your-api-key>
x-account: auto`,
    response: `204 No Content`,
  },
];

const METHOD_STYLE: Record<Method, string> = {
  GET: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  POST: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  PATCH: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  DELETE: "bg-destructive/15 text-destructive",
};

function CodeBlock({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={copy}
        className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-md border border-border bg-card/80 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        title="Copy"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className={cn("overflow-x-auto rounded-xl border border-border bg-card p-4 text-[12.5px] leading-relaxed text-foreground/90", className)}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MethodBadge({ method }: { method: Method }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md px-2 font-mono text-[11px] font-semibold",
        METHOD_STYLE[method],
      )}
    >
      {method}
    </span>
  );
}

export function DocsTab() {
  const curl = `curl -X POST ${API_BASE}/api/tts/{voiceId}/stream \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: <your-api-key>" \\
  -H "x-account: auto" \\
  -d '{
    "text": "Hello from ElevenLabs",
    "model_id": "eleven_multilingual_v2",
    "voice_settings": { "stability": 0.5, "similarity_boost": 0.75 }
  }' \\
  --output audio.mp3`;

  const js = `const res = await fetch("${API_BASE}/api/tts/{voiceId}/stream", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "<your-api-key>",
    "x-account": "auto",
  },
  body: JSON.stringify({
    text: "Hello from ElevenLabs",
    model_id: "eleven_multilingual_v2",
  }),
});

const blob = await res.blob();
const url = URL.createObjectURL(blob);
new Audio(url).play();`;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <FileCode2 className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Proxy API reference</h2>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          This backend proxies the ElevenLabs API and manages multiple accounts.
          Call the endpoints below from your own app with an API key (create one in the{" "}
          <strong className="font-medium text-foreground">API Keys</strong> tab) — no ElevenLabs API key needed.
          All routes are served under <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{API_BASE}</code>.
        </p>
      </header>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Auth &amp; account routing</h3>
        <CodeBlock code={AUTH_NOTES} />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Quick start</h3>
        <CodeBlock code={curl} />
        <CodeBlock code={js} className="mt-3" />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Endpoints</h3>
          <AnimatedBadge status="info" size="sm">
            {ENDPOINTS.length} routes
          </AnimatedBadge>
        </div>
        {ENDPOINTS.map((ep, i) => (
          <motion.div
            key={ep.method + ep.path}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i % 6, 4) * 0.02, type: "spring", stiffness: 320, damping: 30 }}
            className="overflow-hidden rounded-2xl border border-border bg-card"
          >
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
              <MethodBadge method={ep.method} />
              <code className="font-mono text-sm font-medium text-foreground">{ep.path}</code>
              <span className="ml-auto text-xs text-muted-foreground">{ep.name}</span>
            </div>
            <div className="space-y-3 px-4 py-4">
              <p className="text-xs leading-relaxed text-muted-foreground">{ep.desc}</p>
              {ep.query && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Query</p>
                  <CodeBlock code={ep.query} />
                </div>
              )}
              {ep.headers && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Headers</p>
                  <CodeBlock code={ep.headers} />
                </div>
              )}
              {ep.request && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Send className="h-3 w-3" /> Request
                  </p>
                  <CodeBlock code={ep.request} />
                </div>
              )}
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Response</p>
                <CodeBlock code={ep.response} />
              </div>
            </div>
          </motion.div>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Errors:</span> failures return{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{"{ \"error\": \"...\" }"}</code>{" "}
          with an appropriate HTTP status (400 bad request, 404 not found, 5xx upstream).
          The TTS stream endpoint also surfaces useful credit info in its response headers.
        </p>
      </section>
    </div>
  );
}
