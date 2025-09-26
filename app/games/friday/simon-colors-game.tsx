"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GameStatus = "idle" | "preview" | "selecting" | "result";

type ResultState = {
  type: "success" | "fail";
  message: string;
} | null;

type CellColor = {
  id: string;
  swatch: string;
  glow: string;
};

const GRID_SIZE = 5;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const PREVIEW_DURATION = 2000; // ms
const BASE_TARGETS = 1;

const COLOR_POOL: CellColor[] = [
  { id: "ember", swatch: "#fb7185", glow: "rgba(251,113,133,0.45)" },
  { id: "ocean", swatch: "#38bdf8", glow: "rgba(56,189,248,0.45)" },
  { id: "forest", swatch: "#34d399", glow: "rgba(52,211,153,0.45)" },
  { id: "violet", swatch: "#c084fc", glow: "rgba(192,132,252,0.45)" },
  { id: "amber", swatch: "#fbbf24", glow: "rgba(251,191,36,0.45)" },
  { id: "rose", swatch: "#f472b6", glow: "rgba(244,114,182,0.45)" },
  { id: "indigo", swatch: "#818cf8", glow: "rgba(129,140,248,0.45)" },
  { id: "teal", swatch: "#2dd4bf", glow: "rgba(45,212,191,0.45)" },
];

const pickColor = () => COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)];

const buildGrid = () => Array.from({ length: TOTAL_CELLS }, () => pickColor());

const buildTargets = (count: number) => {
  const indices = new Set<number>();
  while (indices.size < count) {
    indices.add(Math.floor(Math.random() * TOTAL_CELLS));
  }
  return Array.from(indices).sort((a, b) => a - b);
};

const formatCountdown = (value: number) => Math.max(0, value).toFixed(1);

export default function SimonColorsGame() {
  const [status, setStatus] = useState<GameStatus>("idle");
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [gridColors, setGridColors] = useState<CellColor[]>(() => buildGrid());
  const [targets, setTargets] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [result, setResult] = useState<ResultState>(null);
  const [previewCountdown, setPreviewCountdown] = useState(0);

  const previewTimeoutRef = useRef<number | null>(null);
  const advanceTimeoutRef = useRef<number | null>(null);
  const previewRafRef = useRef<number | null>(null);

  const targetSet = useMemo(() => new Set(targets), [targets]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const targetCount = targets.length;
  const remainingSelections = Math.max(0, targetCount - selected.length);
  const previewCountdownLabel = useMemo(() => formatCountdown(previewCountdown), [previewCountdown]);

  const clearPreviewTimeout = useCallback(() => {
    if (previewTimeoutRef.current !== null) {
      window.clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
  }, []);

  const clearAdvanceTimeout = useCallback(() => {
    if (advanceTimeoutRef.current !== null) {
      window.clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = null;
    }
  }, []);

  const cancelPreviewRaf = useCallback(() => {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
  }, []);

  const startRound = useCallback(
    (nextLevel: number) => {
      clearPreviewTimeout();
      clearAdvanceTimeout();
      cancelPreviewRaf();

      const targetTotal = Math.min(TOTAL_CELLS, BASE_TARGETS + nextLevel - 1);
      setLevel(nextLevel);
      setGridColors(buildGrid());
      setTargets(buildTargets(targetTotal));
      setSelected([]);
      setResult(null);
      setPreviewCountdown(PREVIEW_DURATION / 1000);
      setStatus("preview");

      previewTimeoutRef.current = window.setTimeout(() => {
        setStatus("selecting");
        setPreviewCountdown(0);
        previewTimeoutRef.current = null;
      }, PREVIEW_DURATION);
    },
    [cancelPreviewRaf, clearAdvanceTimeout, clearPreviewTimeout],
  );

  const startSession = useCallback(() => {
    setScore(0);
    startRound(1);
  }, [startRound]);

  const toggleSelection = useCallback(
    (index: number) => {
      if (status !== "selecting") {
        return;
      }
      setSelected((current) => {
        if (current.includes(index)) {
          return current.filter((item) => item !== index);
        }
        if (current.length >= targetCount) {
          return current;
        }
        return [...current, index].sort((a, b) => a - b);
      });
    },
    [status, targetCount],
  );

  const handleSubmit = useCallback(() => {
    if (status !== "selecting" || targetCount === 0) {
      return;
    }

    const isExactMatch = selected.length === targetCount && selected.every((index) => targetSet.has(index));

    if (isExactMatch) {
      const earned = targetCount;
      setScore((current) => current + earned);
      setResult({ type: "success", message: "Sequence locked in" });
      setStatus("result");
      const nextLevel = level + 1;
      clearAdvanceTimeout();
      advanceTimeoutRef.current = window.setTimeout(() => {
        startRound(nextLevel);
      }, 1300);
    } else {
      setResult({ type: "fail", message: "Mismatch detected" });
      setStatus("result");
    }
  }, [clearAdvanceTimeout, level, selected, startRound, status, targetCount, targetSet]);

  const handleClearSelection = useCallback(() => {
    if (status !== "selecting") {
      return;
    }
    setSelected([]);
  }, [status]);

  const handleRestart = useCallback(() => {
    clearPreviewTimeout();
    clearAdvanceTimeout();
    cancelPreviewRaf();
    setScore(0);
    setLevel(1);
    setSelected([]);
    setTargets([]);
    setGridColors(buildGrid());
    setResult(null);
    setStatus("idle");
  }, [cancelPreviewRaf, clearAdvanceTimeout, clearPreviewTimeout]);

  useEffect(() => {
    if (status !== "preview") {
      cancelPreviewRaf();
      setPreviewCountdown(0);
      return;
    }

    const startedAt = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const remaining = Math.max(0, PREVIEW_DURATION - elapsed);
      setPreviewCountdown(remaining / 1000);
      if (remaining > 0) {
        previewRafRef.current = requestAnimationFrame(tick);
      } else {
        previewRafRef.current = null;
      }
    };

    previewRafRef.current = requestAnimationFrame(tick);

    return cancelPreviewRaf;
  }, [cancelPreviewRaf, status]);

  useEffect(() => {
    return () => {
      clearPreviewTimeout();
      clearAdvanceTimeout();
      cancelPreviewRaf();
    };
  }, [cancelPreviewRaf, clearAdvanceTimeout, clearPreviewTimeout]);

  const shouldRevealTargets = status === "preview" || (status === "result" && result?.type === "fail");
  const canSubmit = status === "selecting" && selected.length === targetCount && targetCount > 0;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-10 px-6 py-14 sm:px-10 lg:px-16">
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted/70">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-muted/70 transition hover:border-white/40 hover:text-white"
          data-swipe-ignore="true"
        >
          <span aria-hidden>←</span>
          Back
        </Link>
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-white/10 px-4 py-2 text-white/80" data-swipe-ignore="true">
            Score <span className="font-mono text-muted/70">{score}</span>
          </div>
          <div className="rounded-full border border-white/5 px-4 py-2 text-muted/60" data-swipe-ignore="true">
            Level <span className="font-mono">{level}</span>
          </div>
        </div>
      </div>

      <header className="flex flex-col gap-3">
        <span className="text-xs uppercase tracking-[0.35em] text-muted/70">Friday</span>
        <h1 className="text-4xl font-semibold text-white sm:text-5xl">Simon Colors</h1>
        <p className="max-w-2xl text-sm text-muted sm:text-base">
          Watch the pulse, remember the glow, and tap the same tiles before the tempo climbs into the weekend.
        </p>
      </header>

      <div className="relative mx-auto w-full max-w-lg" data-swipe-ignore="true">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_25px_60px_rgba(15,23,42,0.35)]">
          <div className="grid grid-cols-5 gap-3">
            {gridColors.map((color, index) => {
              const isTarget = targetSet.has(index);
              const isSelected = selectedSet.has(index);
              const revealHighlight = shouldRevealTargets && isTarget;
              const isLocked = status === "result" && result?.type === "success" && isTarget;

              const highlightShadow = `0 0 0 3px rgba(255,255,255,0.85), 0 0 10px ${color.glow}`;
              const lockedShadow = `0 0 0 2px rgba(255,255,255,0.55), 0 0 20px ${color.glow}`;
              const baseShadow = "0 0 0 1px rgba(15,23,42,0.45)";

              const style: CSSProperties = {
                backgroundColor: color.swatch,
                borderColor: revealHighlight ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.18)",
                boxShadow: revealHighlight ? highlightShadow : isLocked ? lockedShadow : baseShadow,
                filter: revealHighlight ? "brightness(1.75) saturate(1.25)" : "brightness(0.9)",
                transform: revealHighlight ? "scale(1.03)" : undefined,
                outline: isSelected ? "2px solid rgba(255,255,255,0.95)" : undefined,
                outlineOffset: isSelected ? "-3px" : undefined,
              };

              const highlightOverlayStyle: CSSProperties = {
                background: `radial-gradient(circle at 50% 50%, rgba(255,255,255,0.6), ${color.glow})`,
              };
              const highlightOverlayClass = revealHighlight ? "opacity-95 scale-100" : "opacity-0 scale-90";

              return (
                <button
                  key={`${color.id}-${index}`}
                  type="button"
                  onClick={() => toggleSelection(index)}
                  className="group relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed"
                  style={style}
                  disabled={status !== "selecting"}
                  aria-pressed={isSelected}
                >
                  <span
                    className={`pointer-events-none absolute inset-0 rounded-2xl transition duration-200 ease-out ${highlightOverlayClass}`}
                    style={highlightOverlayStyle}
                  />
                  <span
                    className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition group-hover:opacity-20 group-disabled:opacity-0"
                    style={{ background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35), transparent 60%)" }}
                  />
                </button>
              );
            })}
          </div>

          {status === "preview" && (
            <div className="pointer-events-none absolute right-5 top-5 rounded-full bg-black/70 px-3 py-1 text-[0.65rem] uppercase tracking-[0.35em] text-white/80">
              {previewCountdownLabel}s
            </div>
          )}

          {status === "idle" && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-3xl border border-white/10 bg-black/80 px-8 text-center text-sm text-white/80 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.35em] text-white/60">Memorize the pulse when it flashes</p>
              <button
                type="button"
                onClick={startSession}
                className="rounded-full border border-white/25 bg-white/10 px-8 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-white shadow-[0_12px_32px_rgba(56,189,248,0.25)] transition hover:border-white/40 hover:bg-white/20"
              >
                Start game
              </button>
            </div>
          )}

          {status === "result" && result?.type === "success" && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-3xl bg-emerald-500/20 text-sm uppercase tracking-[0.3em] text-emerald-200 backdrop-blur-sm">
              {result.message}
            </div>
          )}

          {status === "result" && result?.type === "fail" && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 rounded-3xl border border-rose-400/20 bg-rose-500/20 px-8 text-center text-sm text-rose-100 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.35em] text-rose-100">{result.message}</p>
              <button
                type="button"
                onClick={startSession}
                className="rounded-full border border-rose-200/60 bg-rose-500/20 px-7 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-rose-50 transition hover:border-rose-100 hover:bg-rose-500/30"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 text-center text-xs text-muted/70" data-swipe-ignore="true">
        {status === "selecting" ? (
          <p className="uppercase tracking-[0.35em] text-muted/60">
            Tap {targetCount} tile{targetCount === 1 ? "" : "s"} · {remainingSelections} remaining
          </p>
        ) : (
          <p className="uppercase tracking-[0.35em] text-muted/60">Watch for the glowing tiles</p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleClearSelection}
            disabled={status !== "selecting" || selected.length === 0}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-muted/70 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:text-muted/40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-500/10 px-5 py-2 text-emerald-100 transition hover:border-emerald-200 hover:bg-emerald-500/20 hover:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-transparent disabled:text-muted/40"
          >
            Submit
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-muted/60">
        <div>Every round adds another glow. Keep the streak alive for higher level gains.</div>
        <button
          type="button"
          onClick={handleRestart}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-muted/70 transition hover:border-white/40 hover:text-white"
        >
          Reset run
          <span aria-hidden className="text-white/60">↻</span>
        </button>
      </div>
    </div>
  );
}
