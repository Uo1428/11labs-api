import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { Account, SharedVoice, Voice } from "../types";
import { Button } from "./ui/button";
import { StatefulButton, type ButtonState } from "./ui/stateful-button";
import { Switch } from "./ui/switch";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { RangeSlider } from "./ui/range-slider";
import { AnimatedBadge } from "./ui/animated-badge";
import { AnimatedNumber } from "./ui/animated-number";
import { AudioPlayer } from "./ui/audio-player";
import { motion } from "motion/react";
import { AudioLines, Download, Loader2, Search, Sparkles, Volume2 } from "lucide-react";
import { SPRING_LAYOUT } from "@/lib/ease";
import { formatUseCase } from "@/lib/format";
import { cn } from "@/lib/utils";

const FALLBACK_MODELS = [
  "eleven_multilingual_v2_exp",
  "eleven_multilingual_v2",
  "eleven_v3",
  "eleven_turbo_v2_5",
  "eleven_flash_v2_5",
];

interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
  use_speaker_boost: boolean;
}

const DEFAULT_SETTINGS: VoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  speed: 1,
  use_speaker_boost: true,
};

function toStudioVoice(sv: SharedVoice): Voice {
  return {
    voice_id: sv.voice_id,
    name: sv.name,
    description: sv.description,
    preview_url: sv.preview_url,
    category: sv.category,
    labels: (() => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries({
        gender: sv.gender,
        age: sv.age,
        accent: sv.accent,
        language: sv.language,
        use_case: sv.use_case,
      })) {
        if (v != null) out[k] = v;
      }
      return out;
    })(),
  };
}

interface Props {
  accounts: Account[];
  accountMode: string;
  setAccountMode: (m: string) => void;
  onGenerated: () => void;
}

export function Studio({ accounts, accountMode, setAccountMode, onGenerated }: Props) {
  const [text, setText] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [search, setSearch] = useState("");
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
  const [modelId, setModelId] = useState(FALLBACK_MODELS[0]);
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);
  const [btnState, setBtnState] = useState<ButtonState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    cost: number;
    accountLabel: string;
    remaining: number;
    historyId: string;
  } | null>(null);
  const [moreVoices, setMoreVoices] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const sharedPageRef = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadVoices();
  }, []);

  const appendShared = useCallback(async () => {
    if (moreLoading) return;
    setMoreLoading(true);
    try {
      const d = await (
        await api(`/shared-voices?sort=trending&page=${sharedPageRef.current}&page_size=30`)
      ).json();
      const batch: SharedVoice[] = d.voices ?? [];
      sharedPageRef.current += 1;
      setVoices((prev) => {
        const seen = new Set(prev.map((v) => v.voice_id));
        const added = batch.filter((v) => !seen.has(v.voice_id));
        return [...prev, ...added.map(toStudioVoice)];
      });
      setMoreVoices(batch.length >= 30);
    } catch {
      // shared feed is best-effort
    } finally {
      setMoreLoading(false);
    }
  }, [moreLoading]);

  // Load the shared voice library progressively as the list is scrolled.
  useEffect(() => {
    const el = sentinelRef.current;
    const root = listRef.current;
    if (!el || !root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && moreVoices) appendShared();
      },
      { root, rootMargin: "400px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [moreVoices, appendShared]);

  async function loadVoices() {
    try {
      const [own, collections] = await Promise.all([
        api("/voices").then((r) => r.json()),
        api("/voices/collections").then((r) => r.json()),
      ]);
      const all: Voice[] = [
        ...(own?.voices ?? []),
        ...(collections?.voices ?? []),
      ];
      const dedup = all.filter(
        (v, i, arr) => arr.findIndex((x) => x.voice_id === v.voice_id) === i,
      );
      setVoices(dedup);
      setMoreVoices(true);
      if (dedup.length) {
        setVoiceId(dedup[0].voice_id);
        applySettings(dedup[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function applySettings(v: Voice) {
    const uniq = [...new Set((v.verified_languages ?? []).map((l) => l.model_id))];
    if (uniq.length) {
      setModels(uniq);
      setModelId(uniq[0]);
    }
    try {
      const s = await (await api(`/voices/${v.voice_id}/settings`)).json();
      setSettings({
        stability: s.stability ?? DEFAULT_SETTINGS.stability,
        similarity_boost: s.similarity_boost ?? DEFAULT_SETTINGS.similarity_boost,
        style: s.style ?? DEFAULT_SETTINGS.style,
        speed: s.speed ?? DEFAULT_SETTINGS.speed,
        use_speaker_boost: s.use_speaker_boost ?? DEFAULT_SETTINGS.use_speaker_boost,
      });
    } catch {
      // keep defaults
    }
  }

  const estimate = text.length;
  const manualAccount = accounts.find((a) => a.id === accountMode) ?? null;

  const autoTarget = useMemo(() => {
    const active = accounts.filter((a) => a.active && a.subscription);
    const enough = active.filter((a) => (a.subscription?.remaining ?? 0) >= estimate);
    const pool = enough.length ? enough : active;
    return (
      [...pool].sort(
        (a, b) => (b.subscription?.remaining ?? 0) - (a.subscription?.remaining ?? 0),
      )[0] ?? null
    );
  }, [accounts, estimate]);

  const activeAccounts = accounts.filter((a) => a.active);

  const insufficient =
    accountMode === "auto"
      ? autoTarget
        ? autoTarget.subscription!.remaining < estimate
        : true
      : manualAccount
        ? (manualAccount.subscription?.remaining ?? 0) < estimate
        : true;

  async function generate() {
    if (!text.trim() || !voiceId || btnState === "loading") return;
    setError(null);
    setLastResult(null);
    setBtnState("loading");
    try {
      const res = await api(`/tts/${voiceId}/stream`, {
        account: accountMode,
        method: "POST",
        body: {
          text,
          model_id: modelId,
          voice_settings: settings,
          output_format: "mp3_44100_128",
        },
      });
      const blob = await res.blob();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(blob));
      setLastResult({
        cost: Number(res.headers.get("x-character-cost") ?? estimate),
        accountLabel: res.headers.get("x-account-label") ?? "",
        remaining: Number(res.headers.get("x-credit-remaining") ?? NaN),
        historyId: res.headers.get("history-item-id") ?? "",
      });
      setBtnState("success");
      onGenerated();
      window.setTimeout(() => setBtnState("idle"), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBtnState("error");
      window.setTimeout(() => setBtnState("idle"), 2500);
    }
  }

  const filteredVoices = voices.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedVoice = voices.find((v) => v.voice_id === voiceId) ?? null;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        {/* Text input */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Text</label>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {text.length.toLocaleString()} chars · est. cost {estimate.toLocaleString()}
            </span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder="Type or paste text to synthesize…"
            className="w-full resize-y rounded-xl border border-border bg-background p-3.5 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/40 focus:ring-2 focus:ring-ring/40"
          />
          {insufficient && text.length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-500">
              <Sparkles className="h-3 w-3" />
              insufficient credits for estimate
            </p>
          )}
        </div>

        {/* Voice picker */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Voice</label>
            {selectedVoice && (
              <AnimatedBadge status="info" size="sm" showIcon={false}>
                {selectedVoice.name}
              </AnimatedBadge>
            )}
          </div>
          <Input
            value={search}
            onChange={setSearch}
            placeholder="Search voices…"
            leftIcon={<Search />}
            className="mb-3"
          />
          <div
            ref={listRef}
            className="grid max-h-80 grid-cols-1 gap-1.5 overflow-auto rounded-xl border border-border p-1.5 sm:grid-cols-2"
          >
            {filteredVoices.map((v) => (
              <VoiceRow
                key={v.voice_id}
                voice={v}
                active={voiceId === v.voice_id}
                onClick={() => {
                  setVoiceId(v.voice_id);
                  applySettings(v);
                }}
              />
            ))}
            {filteredVoices.length === 0 && (
              <p className="col-span-full p-3 text-center text-xs text-muted-foreground">no voices found</p>
            )}
            <div ref={sentinelRef} className="col-span-full h-px" aria-hidden />
          </div>
          {moreLoading && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              Loading more voices…
            </p>
          )}
        </div>

        {/* Model */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <label className="mb-2 block text-xs font-medium text-muted-foreground">Model</label>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-[11px] text-muted-foreground">output: mp3 · 44.1kHz · 128kbps</p>
        </div>

        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-5">
        {/* Account */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <label className="mb-2 block text-xs font-medium text-muted-foreground">
            Account for generation
          </label>
          <Select value={accountMode} onValueChange={setAccountMode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              {activeAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label} · {(a.subscription?.remaining ?? 0).toLocaleString()} left
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="mt-3 rounded-xl bg-background px-3 py-2.5">
            {accountMode === "auto" ? (
              autoTarget ? (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    Auto → <span className="font-medium text-foreground">{autoTarget.label}</span>
                  </span>
                  <span className="text-[11px] tabular-nums text-primary">
                    <AnimatedNumber value={autoTarget.subscription?.remaining ?? 0} />
                    &nbsp;left
                  </span>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Auto (no active accounts)</p>
              )
            ) : manualAccount ? (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">{manualAccount.label}</span>
                </span>
                <span className="text-[11px] tabular-nums text-primary">
                  <AnimatedNumber value={manualAccount.subscription?.remaining ?? 0} />
                  &nbsp;left
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Select an account</p>
            )}
          </div>
        </div>

        {/* Voice settings */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <AudioLines className="h-3.5 w-3.5" />
            Voice settings
          </p>
          <SliderRow
            label="Stability"
            min={0}
            max={1}
            step={0.05}
            value={settings.stability}
            onChange={(v) => setSettings({ ...settings, stability: v })}
          />
          <SliderRow
            label="Similarity"
            min={0}
            max={1}
            step={0.05}
            value={settings.similarity_boost}
            onChange={(v) => setSettings({ ...settings, similarity_boost: v })}
          />
          <SliderRow
            label="Style"
            min={0}
            max={1}
            step={0.05}
            value={settings.style}
            onChange={(v) => setSettings({ ...settings, style: v })}
          />
          <SliderRow
            label="Speed"
            min={0.5}
            max={2}
            step={0.1}
            value={settings.speed}
            onChange={(v) => setSettings({ ...settings, speed: v })}
          />
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm text-foreground">Speaker boost</span>
            <Switch
              checked={settings.use_speaker_boost}
              onCheckedChange={(v) => setSettings({ ...settings, use_speaker_boost: v })}
              ariaLabel="Toggle speaker boost"
            />
          </div>
        </div>

        {/* Generate */}
        <StatefulButton
          onClick={generate}
          state={btnState}
          loadingText="Generating…"
          successText="Done"
          errorText="Retry"
          icon={<Volume2 className="h-4 w-4" />}
          disabled={!text.trim() || !voiceId}
          size="lg"
          className="w-full"
        >
          Generate speech
        </StatefulButton>

        {lastResult && (
          <motion.div
            layout
            transition={SPRING_LAYOUT}
            className="space-y-1.5 rounded-2xl border border-border bg-card px-4 py-3 text-[11px]"
          >
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Used</span>
              <span className="font-medium text-foreground">{lastResult.accountLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cost</span>
              <span className="font-semibold text-amber-500">−{lastResult.cost.toLocaleString()} chars</span>
            </div>
            {!Number.isNaN(lastResult.remaining) && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Remaining</span>
                <span className="font-semibold text-emerald-500">
                  <AnimatedNumber value={lastResult.remaining} />
                </span>
              </div>
            )}
          </motion.div>
        )}

        {audioUrl && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Result</p>
            <AudioPlayer src={audioUrl} />
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={() => {
                const link = document.createElement("a");
                link.href = audioUrl;
                link.download = "speech.mp3";
                link.click();
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Download mp3
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function VoiceRow({
  voice,
  active,
  onClick,
}: {
  voice: Voice;
  active: boolean;
  onClick: () => void;
}) {
  const labels = voice.labels ?? {};
  const meta = [labels.gender, labels.age, labels.accent].filter(Boolean);
  const languages = voice.verified_languages ?? [];
  return (
    <div
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border p-3 transition-colors",
        active
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-background/40 hover:border-border-strong hover:bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/50 text-[11px] font-semibold text-foreground/80">
            {voice.name
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase())
              .join("")}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">
              {voice.name}
            </span>
            {meta.length > 0 && (
              <span className="block truncate text-[10px] capitalize text-muted-foreground">
                {meta.join(" · ")}
              </span>
            )}
          </span>
        </div>
        {active && (
          <motion.span
            layoutId="studio-voice-active"
            className="size-2 shrink-0 rounded-full bg-primary"
          />
        )}
      </div>
      {voice.description && (
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
          {voice.description}
        </p>
      )}
      {labels.use_case && (
        <div className="mt-2">
          <AnimatedBadge status="info" size="sm" showIcon={false}>
            <Sparkles className="h-3 w-3" />
            {formatUseCase(labels.use_case)}
          </AnimatedBadge>
        </div>
      )}
      {languages.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {languages.slice(0, 3).map((l) => (
            <AnimatedBadge key={l.language + l.model_id} status="neutral" size="sm" showIcon={false}>
              {l.language}
            </AnimatedBadge>
          ))}
          {languages.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{languages.length - 3}</span>
          )}
        </div>
      )}
      {voice.preview_url && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <AudioPlayer src={voice.preview_url} />
        </div>
      )}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">{value.toFixed(step >= 0.1 ? 1 : 2)}</span>
      </div>
      <RangeSlider value={value} min={min} max={max} step={step} onValueChange={onChange} />
    </div>
  );
}