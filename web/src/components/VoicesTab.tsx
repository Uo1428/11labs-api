import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { SharedVoice } from "../types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { AnimatedBadge } from "./ui/animated-badge";
import { AudioPlayer } from "./ui/audio-player";
import { motion } from "motion/react";
import {
  AudioLines,
  Loader2,
  Mars,
  PersonStanding,
  Sparkles,
  Venus,
} from "lucide-react";
import { SPRING_LAYOUT } from "@/lib/ease";
import { formatUseCase } from "@/lib/format";
import { cn } from "@/lib/utils";

const SORTS = ["trending", "recent", "popular"];
const PAGE_SIZE = 30;

const AGE_LABEL: Record<string, string> = {
  young: "Young",
  middle_aged: "Middle-aged",
  old: "Senior",
};

function GenderGlyph({ gender }: { gender?: string }) {
  const g = (gender ?? "").toLowerCase();
  if (g === "female")
    return <Venus className="size-3 text-fuchsia-400/80" />;
  if (g === "male") return <Mars className="size-3 text-sky-400/80" />;
  return <PersonStanding className="size-3 text-muted-foreground" />;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function VoicesTab({ accountMode }: { accountMode: string }) {
  const [voices, setVoices] = useState<SharedVoice[]>([]);
  const [sort, setSort] = useState("trending");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadRef = useRef<{
    sort: string;
    accountMode: string;
    page: number;
    voices: SharedVoice[];
    loading: boolean;
  }>({ sort, accountMode, page, voices, loading: false });

  loadRef.current = { sort, accountMode, page, voices, loading: loadRef.current.loading };

  const load = useCallback(async () => {
    if (loadRef.current.loading) return;
    loadRef.current.loading = true;
    const { sort, accountMode, page } = loadRef.current;
    setLoading(true);
    try {
      const d = await (
        await api(`/shared-voices?sort=${sort}&page=${page}&page_size=${PAGE_SIZE}`, { account: accountMode })
      ).json();
      const batch: SharedVoice[] = d.voices ?? [];
      const existing = loadRef.current.voices;
      const dedup = batch.filter(
        (v) => !existing.some((e) => e.voice_id === v.voice_id),
      );
      setVoices((prev) => [...prev, ...dedup]);
      setHasMore(batch.length >= PAGE_SIZE);
      loadRef.current.voices = [...existing, ...dedup];
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      loadRef.current.loading = false;
    }
  }, []);

  const reset = useCallback(
    (nextSort: string) => {
      setSort(nextSort);
      setPage(1);
      setVoices([]);
      setHasMore(true);
      loadRef.current = { sort: nextSort, accountMode, page: 1, voices: [], loading: false };
    },
    [accountMode],
  );

  // Initial load + reload when sort / account changes.
  useEffect(() => {
    loadRef.current.page = 1;
    setVoices([]);
    setHasMore(true);
    loadRef.current.voices = [];
    load();
  }, [sort, accountMode, load]);

  // Infinite scroll: load next page when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadRef.current.page += 1;
          load();
        }
      },
      { rootMargin: "600px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, load]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <AudioLines className="h-4 w-4 text-primary" />
          Voice library
          <span className="text-xs font-normal text-muted-foreground">
            {voices.length} voices
          </span>
        </h2>
        <Select
          value={sort}
          onValueChange={reset}
          className="w-36"
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {voices.map((v, i) => (
          <VoiceCard key={v.voice_id} voice={v} index={i} />
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Loading more voices…
        </div>
      )}

      {!hasMore && voices.length > 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          You've reached the end of the library.
        </p>
      )}

      <div ref={sentinelRef} className="h-px" aria-hidden />
    </div>
  );
}

function VoiceCard({ voice, index }: { voice: SharedVoice; index: number }) {
  const age = voice.age ? AGE_LABEL[voice.age.toLowerCase()] ?? voice.age : null;
  const meta = [age, voice.accent, voice.language].filter(Boolean);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{
        type: "spring",
        stiffness: 360,
        damping: 32,
        mass: 0.6,
        delay: Math.min(index % 6, 4) * 0.03,
      }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/30"
    >
      {/* soft top wash for depth, kept inside the theme */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/5 to-transparent"
      />

      <div className="relative flex items-start gap-3 p-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-muted/50 text-xs font-semibold text-foreground/80">
          {initials(voice.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="min-w-0 truncate text-sm font-medium text-foreground">
              {voice.name}
            </p>
            <GenderGlyph gender={voice.gender} />
          </div>
          {meta.length > 0 && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {meta.join(" · ")}
            </p>
          )}
        </div>
      </div>

      {(voice.use_case || voice.category) && (
        <div className="relative flex flex-wrap gap-1 px-4">
          {voice.use_case && (
            <AnimatedBadge status="info" size="sm" showIcon={false}>
              <Sparkles className="h-3 w-3" />
              {formatUseCase(voice.use_case)}
            </AnimatedBadge>
          )}
          {voice.category && (
            <AnimatedBadge status="neutral" size="sm" showIcon={false}>
              {formatUseCase(voice.category)}
            </AnimatedBadge>
          )}
        </div>
      )}

      {voice.description && (
        <p className="relative mt-2.5 line-clamp-2 px-4 text-[11px] leading-relaxed text-muted-foreground">
          {voice.description}
        </p>
      )}

      <div className="relative mt-auto px-4 pb-4 pt-3">
        {voice.preview_url ? (
          <AudioPlayer src={voice.preview_url} />
        ) : (
          <p className="text-[11px] text-muted-foreground">no preview available</p>
        )}
      </div>
    </motion.div>
  );
}