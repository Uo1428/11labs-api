"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface AudioPlayerProps {
  src: string;
  autoPlay?: boolean;
  className?: string;
}

export function AudioPlayer({ src, autoPlay, className }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);

  useEffect(() => {
    setCurrent(0);
    setDuration(0);
    setPlaying(false);
  }, [src]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !autoPlay) return;
    a.play().catch(() => {
      // autoplay can be rejected; state stays synced via onPlay/onPause
    });
  }, [src, autoPlay]);

  useEffect(() => {
    return () => audioRef.current?.pause();
  }, []);

  async function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      return;
    }
    try {
      await a.play();
    } catch {
      // no-op
    }
  }

  function seekTo(clientX: number) {
    const a = audioRef.current;
    const el = trackRef.current;
    if (!a || !el || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const t = ratio * duration;
    a.currentTime = t;
    setCurrent(t);
  }

  const pct = duration ? (current / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "flex h-11 items-center gap-2 rounded-full border border-border bg-background px-2",
        className,
      )}
    >
      <motion.button
        type="button"
        whileTap={{ scale: 0.88 }}
        transition={{ type: "spring", stiffness: 500, damping: 30, mass: 0.6 }}
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
      >
        {playing ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        )}
      </motion.button>

      <div
        ref={trackRef}
        onPointerDown={(e) => {
          setSeeking(true);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          seekTo(e.clientX);
        }}
        onPointerMove={(e) => {
          if (seeking) seekTo(e.clientX);
        }}
        onPointerUp={(e) => {
          setSeeking(false);
          try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          } catch {
            // already released
          }
        }}
        className="relative h-1.5 flex-1 cursor-pointer touch-none rounded-full bg-muted select-none"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>

      <span className="shrink-0 pr-1 text-[11px] tabular-nums text-muted-foreground">
        {formatTime(current)}
        {duration ? ` / ${formatTime(duration)}` : ""}
      </span>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => {
          if (!seeking) setCurrent(e.currentTarget.currentTime);
        }}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
    </div>
  );
}