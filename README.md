<div align="center">

# 🎙️ 11Labs API Gateway

**One API. Every ElevenLabs account you own. Zero shared passwords.**

A private, self-hosted gateway that pools your ElevenLabs accounts behind a single clean API — with automatic failover, per-key billing, and a dashboard that actually shows you what's happening.

<br>

<img src="https://img.shields.io/badge/runtime-Bun-black?logo=bun&logoColor=white" height="24">
<img src="https://img.shields.io/badge/server-Express-2596be" height="24">
<img src="https://img.shields.io/badge/web-React%2019-61dafb" height="24">
<img src="https://img.shields.io/badge/ui-Tailwind%20v4-38bdf8" height="24">

</div>

---

## 🤔 The problem

You have a handful of ElevenLabs accounts. Now you want to:

- Share TTS access with a team — **without** handing out your login.
- Use every account's quota, so nothing sits idle.
- Know **who** burned **how many** characters.
- Keep running when one account runs out or breaks.

Managing that by hand is a mess. That's the problem this solves.

## 💡 The idea

```
        your app / team
              │  x-api-key: llk_…
              ▼
     ┌────────────────────┐
     │    THE GATEWAY     │   one URL, one auth model
     │  · route the job   │
     │  · track the cost  │
     │  · swap on failure │
     └────────┬───────────┘
              │ (picks the best account, silently)
     ┌────────▼───────────┬───────────┬───────────┐
     │  ElevenLabs Acct 1 │  Acct 2   │  Acct 3   │
     └────────────────────┴───────────┴───────────┘
```

You talk to **one** API. The gateway talks to **all** your accounts and makes it look like one giant quota.

## ✨ What it does

| | Feature | Why you care |
|---|---|---|
| 🔀 | **Smart routing** | Each request goes to the account with the most credits left |
| 🛟 | **Auto-failover** | Account errored? It retries on the next healthiest one |
| 🔑 | **Scoped API keys** | Mint `llk_…` keys, pause or delete them — never share logins |
| 📊 | **Usage tracking** | Characters used, per key, per account, per day |
| 📜 | **Audit log** | Every request logged: who, what, when, status, latency |
| 💾 | **Voice caching** | Voices/settings cached 10 min — fewer upstream calls |
| 🩺 | **Health panel** | Token state, credits, last error for every account at a glance |

## 🚀 Quick start

**You need:** [Bun](https://bun.sh) installed.

```bash
# 1 — install everything
bun install

# 2 — start the gateway + dashboard together
bun dev
```

Done. The **API** is at `http://localhost:8787`, the **dashboard** is in your browser (usually `http://localhost:5173`).

### First login

Grab your **admin key** from the server's console output on first boot (or set `ADMIN_KEY` yourself). Paste it into the dashboard's login screen — that's it.

### Add your first account

```bash
curl -X POST http://localhost:8787/api/accounts \
  -H "x-admin-key: <admin-key>" \
  -H "content-type: application/json" \
  -d '{"label": "Pro plan", "refreshToken": "<your-el-token>"}'
```

### Generate speech

```bash
curl http://localhost:8787/api/tts/<voice-id>/stream \
  -X POST \
  -H "x-api-key: llk_…" \
  -H "content-type: application/json" \
  -d '{"text": "Hello from the gateway"}' \
  --output speech.mp3
```

## 🔧 How routing works

1. Gather all **active** accounts and check each one's remaining characters.
2. Keep the accounts that can **afford** the request.
3. Sort by **most credits left**, then oldest first.
4. Send the job to the winner — and remember it for failover.

The chosen account comes back in the response headers:

```
x-account-id:       which account handled it
x-account-label:    friendly name
x-character-cost:   characters charged
x-credit-remaining: what's left after this call
```

Pin an account manually with the `x-account: <account-id>` header (default is `auto`).

## 🗂️ Project layout

```
server/            the gateway (Express + TypeScript, runs on Bun)
  src/config.ts    environment + paths
  src/store.ts     account CRUD
  src/keys.ts      scoped API keys + admin key
  src/upstream.ts  ElevenLabs client, routing, failover
  src/firebase.ts  token refresh + caching
  src/observe.ts   usage + audit + error logs

web/               the dashboard (React 19 + Vite + Tailwind)
  src/components/  Studio · Voices · History · Usage · Keys · Docs
```

All state lives in `server/data/` as plain JSON — **gitignored**, so your tokens never hit git.

## ⚙️ Configuration

Set these on the **server** package:

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `8787` | Gateway port |
| `ADMIN_KEY` | auto-generated | Dashboard login key (saved to `server/data/admin.key` if unset) |
| `FIREBASE_API_KEY` | bundled | Exchanges refresh tokens for access tokens |
| `UPSTREAM_BASE` | `api.us.elevenlabs.io` | ElevenLabs API to proxy |
| `*_FILE` | `server/data/*.json` | Where JSON state lives |

The **dashboard** reads `VITE_API_BASE` to find your gateway.

## 🔌 API at a glance

| Method | Path | What it does |
| --- | --- | --- |
| `POST` | `/api/tts/:voiceId/stream` | Streaming TTS with routing + failover |
| `GET` | `/api/voices` … | Voices, collections, settings (cached) |
| `GET` | `/api/shared-voices` | Community voices |
| `GET` / `DELETE` | `/api/history…` | TTS history + audio |
| `GET` | `/api/me` · `/api/subscription` | Account + remaining credits |
| CRUD | `/api/accounts` | Manage the account pool *(admin)* |
| CRUD | `/api/api-keys` | Issue / revoke scoped keys *(admin)* |
| `GET` | `/api/usage/*` · `/api/logs` · `/api/errors` | Analytics *(admin)* |
| `GET` | `/api/admin/health` | Health of every account *(admin)* |

Every request needs `x-admin-key` or `x-api-key`.

## 🔒 Security notes

- API keys are stored as **SHA-256 hashes** — the raw token is shown once, at creation.
- Comparisons are **timing-safe**.
- `server/data/` holds tokens and logs — it's gitignored. Back it up; never commit it.
- Refresh tokens = full access to that account. Treat them like passwords.

## 🧱 Built with

**Runtime** · Bun · TypeScript · Express
**Frontend** · React 19 · Vite 6 · Tailwind CSS v4 · Motion · lucide-react
