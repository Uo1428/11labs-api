import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { HistoryItem } from "../types";
import { Button } from "./ui/button";
import { AnimatedBadge } from "./ui/animated-badge";
import { AudioPlayer } from "./ui/audio-player";
import { motion } from "motion/react";
import { History, Play, Square, Trash2 } from "lucide-react";
import { SPRING_LAYOUT } from "@/lib/ease";

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleString();
}

export function HistoryTab({ accountMode }: { accountMode: string }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await (await api("/history", { account: accountMode })).json();
      setItems(d.history ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [accountMode]);

  useEffect(() => {
    load();
  }, [load]);

  async function play(id: string) {
    if (playingId === id) {
      setPlayingId(null);
      setAudioUrl(null);
      return;
    }
    try {
      const res = await api(`/history/${id}/audio`, { account: accountMode });
      const blob = await res.blob();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(blob));
      setPlayingId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(id: string) {
    try {
      await api(`/history/${id}`, { account: accountMode, method: "DELETE" });
      if (playingId === id) {
        setPlayingId(null);
        setAudioUrl(null);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <History className="h-4 w-4 text-primary" />
          TTS history
        </h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
          {error}
        </p>
      )}

      {items.length === 0 && !loading && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center text-xs text-muted-foreground">
          <History className="h-5 w-5 opacity-60" />
          No history yet. Generate speech to see it here.
        </div>
      )}

      {items.map((it) => (
        <motion.div
          key={it.history_item_id}
          layout
          transition={SPRING_LAYOUT}
          className="rounded-2xl border border-border bg-card p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm text-foreground">{it.text ?? "(no text)"}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <AnimatedBadge status="neutral" size="sm" showIcon={false}>
                  {it.voice_name ?? it.voice_id ?? "unknown voice"}
                </AnimatedBadge>
                <AnimatedBadge status="info" size="sm" showIcon={false}>
                  {it.model_id}
                </AnimatedBadge>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {formatDate(it.date_unix)}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant={playingId === it.history_item_id ? "secondary" : "primary"} onClick={() => play(it.history_item_id)}>
                {playingId === it.history_item_id ? (
                  <>
                    <Square className="h-3.5 w-3.5" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    Play
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => remove(it.history_item_id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {playingId === it.history_item_id && audioUrl && (
            <AudioPlayer key={it.history_item_id} src={audioUrl} autoPlay className="mt-3" />
          )}
        </motion.div>
      ))}
    </div>
  );
}