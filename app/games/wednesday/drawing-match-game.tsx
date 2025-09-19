"use client";

import Link from "next/link";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GameStatus = "intro" | "preview" | "drawing" | "evaluating" | "result" | "over";

type ShapeType = "circle" | "rectangle" | "triangle";

type ShapeColor = {
  id: string;
  name: string;
  fill: string;
  glow: string;
};

type Point = { x: number; y: number };

type ShapeSpec = {
  id: string;
  type: ShapeType;
  color: ShapeColor;
  rotation: number;
  points: Point[];
  outline: Point[];
  tightMask: Uint8Array;
  tightMaskCount: number;
  looseMask: Uint8Array;
};

const CANVAS_SIZE = 320;
const PREVIEW_DURATION = 2400; // ms
const DRAW_WINDOW = 12000; // ms
const SKETCH_ALPHA_THRESHOLD = 40;
const TIGHT_RADIUS = 4;
const LOOSE_RADIUS = 10;
const OUTLINE_SAMPLES = 240;

const SHAPE_COLORS: ShapeColor[] = [
  { id: "sunset", name: "Sunset", fill: "#fb7185", glow: "rgba(251,113,133,0.45)" },
  { id: "ocean", name: "Ocean", fill: "#38bdf8", glow: "rgba(56,189,248,0.45)" },
  { id: "lime", name: "Lime", fill: "#a3e635", glow: "rgba(163,230,53,0.45)" },
  { id: "violet", name: "Violet", fill: "#c084fc", glow: "rgba(192,132,252,0.45)" },
  { id: "ember", name: "Ember", fill: "#fb923c", glow: "rgba(251,146,60,0.45)" },
  { id: "teal", name: "Teal", fill: "#14b8a6", glow: "rgba(20,184,166,0.45)" },
];

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

const pickColor = (): ShapeColor => SHAPE_COLORS[Math.floor(Math.random() * SHAPE_COLORS.length)];

const rotatePoint = (point: Point, rotation: number, center: Point): Point => {
  if (rotation === 0) {
    return point;
  }
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
};

const sampleCircleOutline = (center: Point, radius: number, rotation: number) => {
  const samples: Point[] = [];
  for (let index = 0; index < OUTLINE_SAMPLES; index += 1) {
    const angle = (index / OUTLINE_SAMPLES) * Math.PI * 2;
    const point = {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
    samples.push(rotatePoint(point, rotation, center));
  }
  return samples;
};

const samplePolygonOutline = (points: Point[], rotation: number) => {
  const center = { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 };
  const closed = [...points, points[0]];
  const segments = [] as Array<{ start: Point; end: Point; length: number }>;
  let perimeter = 0;
  for (let index = 0; index < closed.length - 1; index += 1) {
    const start = closed[index];
    const end = closed[index + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    perimeter += length;
    segments.push({ start, end, length });
  }

  const samples: Point[] = [];
  if (perimeter === 0) {
    return samples;
  }

  const spacing = perimeter / OUTLINE_SAMPLES;
  let currentSegmentIndex = 0;
  let currentCumulative = 0;

  for (let sampleIndex = 0; sampleIndex < OUTLINE_SAMPLES; sampleIndex += 1) {
    const targetDistance = spacing * sampleIndex;
    while (
      currentSegmentIndex < segments.length - 1 &&
      targetDistance > currentCumulative + segments[currentSegmentIndex].length
    ) {
      currentCumulative += segments[currentSegmentIndex].length;
      currentSegmentIndex += 1;
    }

    const segment = segments[currentSegmentIndex];
    const segmentDistance = targetDistance - currentCumulative;
    const t = segment.length === 0 ? 0 : segmentDistance / segment.length;
    const point = {
      x: segment.start.x + (segment.end.x - segment.start.x) * t,
      y: segment.start.y + (segment.end.y - segment.start.y) * t,
    };
    samples.push(rotatePoint(point, rotation, center));
  }

  return samples;
};

const buildOutlineMask = (outline: Point[], radius: number) => {
  const width = CANVAS_SIZE;
  const height = CANVAS_SIZE;
  const mask = new Uint8Array(width * height);
  const r = Math.max(1, Math.floor(radius));
  let count = 0;
  outline.forEach((point) => {
    const startX = Math.max(0, Math.floor(point.x) - r);
    const endX = Math.min(width - 1, Math.floor(point.x) + r);
    const startY = Math.max(0, Math.floor(point.y) - r);
    const endY = Math.min(height - 1, Math.floor(point.y) + r);
    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        const dx = x - point.x;
        const dy = y - point.y;
        if (dx * dx + dy * dy <= radius * radius) {
          const index = y * width + x;
          if (mask[index] === 0) {
            mask[index] = 1;
            count += 1;
          }
        }
      }
    }
  });
  return { mask, count };
};

const createShape = (): ShapeSpec => {
  const typeRoll = Math.random();
  let type: ShapeType = "circle";
  if (typeRoll > 0.66) {
    type = "triangle";
  } else if (typeRoll > 0.33) {
    type = "rectangle";
  }

  const color = pickColor();
  const rotation = type === "circle" ? 0 : randomBetween(-Math.PI / 5, Math.PI / 5);
  const size = randomBetween(140, 200);
  const center = { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 };

  if (type === "circle") {
    const radius = size / 2;
    const samples: Point[] = [];
    const STEPS = 64;
    for (let index = 0; index < STEPS; index += 1) {
      const angle = (index / STEPS) * Math.PI * 2;
      samples.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
    }
    const outline = sampleCircleOutline(center, radius, rotation);
    const tight = buildOutlineMask(outline, TIGHT_RADIUS);
    const loose = buildOutlineMask(outline, LOOSE_RADIUS);
    return {
      id: `${type}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      color,
      rotation,
      points: samples,
      outline,
      tightMask: tight.mask,
      tightMaskCount: tight.count,
      looseMask: loose.mask,
    };
  }

  if (type === "rectangle") {
    const width = randomBetween(120, size);
    const height = randomBetween(120, size);
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const points = [
      { x: center.x - halfWidth, y: center.y - halfHeight },
      { x: center.x + halfWidth, y: center.y - halfHeight },
      { x: center.x + halfWidth, y: center.y + halfHeight },
      { x: center.x - halfWidth, y: center.y + halfHeight },
    ];
    const outline = samplePolygonOutline(points, rotation);
    const tight = buildOutlineMask(outline, TIGHT_RADIUS);
    const loose = buildOutlineMask(outline, LOOSE_RADIUS);
    return {
      id: `${type}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      color,
      rotation,
      points,
      outline,
      tightMask: tight.mask,
      tightMaskCount: tight.count,
      looseMask: loose.mask,
    };
  }

  const base = randomBetween(140, size);
  const height = randomBetween(130, size);
  const points = [
    { x: center.x, y: center.y - height / 2 },
    { x: center.x - base / 2, y: center.y + height / 2 },
    { x: center.x + base / 2, y: center.y + height / 2 },
  ];

  const outline = samplePolygonOutline(points, rotation);
  const tight = buildOutlineMask(outline, TIGHT_RADIUS);
  const loose = buildOutlineMask(outline, LOOSE_RADIUS);
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    color,
    rotation,
    points,
    outline,
    tightMask: tight.mask,
    tightMaskCount: tight.count,
    looseMask: loose.mask,
  };
};

const drawShape = (ctx: CanvasRenderingContext2D, spec: ShapeSpec) => {
  clearCanvas(ctx);
  ctx.save();
  ctx.translate(CANVAS_SIZE / 2, CANVAS_SIZE / 2);
  ctx.rotate(spec.rotation);
  ctx.translate(-CANVAS_SIZE / 2, -CANVAS_SIZE / 2);
  ctx.beginPath();
  if (spec.type === "circle") {
    const first = spec.points[0];
    const radius = Math.hypot(first.x - CANVAS_SIZE / 2, first.y - CANVAS_SIZE / 2);
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, radius, 0, Math.PI * 2);
  } else {
    spec.points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.closePath();
  }
  ctx.fillStyle = spec.color.fill;
  ctx.shadowBlur = 28;
  ctx.shadowColor = spec.color.glow;
  ctx.fill();
  ctx.restore();
};

const clearCanvas = (ctx: CanvasRenderingContext2D) => {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
};

const formatAccuracy = (accuracy: number) => `${Math.round(accuracy * 100)}%`;

export default function DrawingMatchGame() {
  const [status, setStatus] = useState<GameStatus>("intro");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [progress, setProgress] = useState(1);
  const [hasSketch, setHasSketch] = useState(false);
  const [previewCountdown, setPreviewCountdown] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const backgroundCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const previewTimeoutRef = useRef<number | null>(null);
  const roundTimeoutRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const drawingActiveRef = useRef(false);
  const targetShapeRef = useRef<ShapeSpec | null>(null);
  const pixelRatioRef = useRef(1);

  const getCanvasPoint = useCallback((event: PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const backgroundCanvas = backgroundCanvasRef.current;
    if (!canvas || !backgroundCanvas) {
      return;
    }
    const ratio = window.devicePixelRatio ?? 1;
    pixelRatioRef.current = ratio;

    const setupCanvas = (
      target: HTMLCanvasElement,
      options?: CanvasRenderingContext2DSettings
    ) => {
      const context = target.getContext("2d", options);
      if (!context) {
        return null;
      }
      target.width = CANVAS_SIZE * ratio;
      target.height = CANVAS_SIZE * ratio;
      target.style.width = `${CANVAS_SIZE}px`;
      target.style.height = `${CANVAS_SIZE}px`;
      context.scale(ratio, ratio);
      context.lineCap = "round";
      context.lineJoin = "round";
      clearCanvas(context);
      return context;
    };

    const context = setupCanvas(canvas, { willReadFrequently: true });
    const backgroundContext = setupCanvas(backgroundCanvas);
    if (!context || !backgroundContext) {
      return;
    }
    ctxRef.current = context;
    backgroundCtxRef.current = backgroundContext;

    return () => {
      if (previewTimeoutRef.current) {
        window.clearTimeout(previewTimeoutRef.current);
      }
      if (roundTimeoutRef.current) {
        window.clearTimeout(roundTimeoutRef.current);
      }
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (previewRafRef.current) {
        window.cancelAnimationFrame(previewRafRef.current);
        previewRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
    }
  }, [score, highScore]);

  const resetTimers = useCallback(() => {
    if (previewTimeoutRef.current) {
      window.clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
    if (roundTimeoutRef.current) {
      window.clearTimeout(roundTimeoutRef.current);
      roundTimeoutRef.current = null;
    }
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (previewRafRef.current) {
      window.cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    setPreviewCountdown(0);
  }, []);

  const clearReferenceOverlay = useCallback(() => {
    const backgroundCtx = backgroundCtxRef.current;
    if (!backgroundCtx) {
      return;
    }
    clearCanvas(backgroundCtx);
  }, []);

  const renderReferenceOverlay = useCallback((opacity = 0.35) => {
    const backgroundCtx = backgroundCtxRef.current;
    const shape = targetShapeRef.current;
    if (!backgroundCtx || !shape) {
      return;
    }
    backgroundCtx.save();
    backgroundCtx.globalAlpha = opacity;
    drawShape(backgroundCtx, shape);
    backgroundCtx.restore();
  }, []);

  const beginPreview = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) {
      return;
    }
    resetTimers();
    clearReferenceOverlay();
    drawingActiveRef.current = false;
    setHasSketch(false);
    setProgress(1);
    const shape = createShape();
    targetShapeRef.current = shape;
    drawShape(ctx, shape);
    setStatus("preview");

    setPreviewCountdown(PREVIEW_DURATION / 1000);
    const deadline = performance.now() + PREVIEW_DURATION;
    const tick = () => {
      const remaining = Math.max(0, deadline - performance.now());
      setPreviewCountdown(remaining / 1000);
      if (remaining > 0) {
        previewRafRef.current = window.requestAnimationFrame(tick);
      } else {
        previewRafRef.current = null;
      }
    };
    previewRafRef.current = window.requestAnimationFrame(tick);

    previewTimeoutRef.current = window.setTimeout(() => {
      if (previewRafRef.current) {
        window.cancelAnimationFrame(previewRafRef.current);
        previewRafRef.current = null;
      }
      setPreviewCountdown(0);
      clearCanvas(ctx);
      setStatus("drawing");
    }, PREVIEW_DURATION);
  }, [clearReferenceOverlay, resetTimers]);

  const failRound = useCallback(
    (reason: string, options?: { keepReference?: boolean }) => {
      resetTimers();
      if (!options?.keepReference) {
        clearReferenceOverlay();
      }
      setFailureReason(reason);
      setStatus("over");
      setStreak(0);
      setHasSketch(false);
      setProgress(1);
    },
    [clearReferenceOverlay, resetTimers]
  );

  const evaluateSketch = useCallback(() => {
    const ctx = ctxRef.current;
    const shape = targetShapeRef.current;
    if (!ctx || !shape || shape.outline.length === 0) {
      return;
    }
    setStatus("evaluating");
    const { width: actualWidth, height: actualHeight } = ctx.canvas;
    const ratioX = actualWidth / CANVAS_SIZE;
    const ratioY = actualHeight / CANVAS_SIZE;
    const snapshot = ctx.getImageData(0, 0, actualWidth, actualHeight);
    const { data: sketchData } = snapshot;

    let outlineHits = 0;
    let strayPixels = 0;
    let drawnPixels = 0;

    // Downsample high-DPI canvas data back to the logical canvas grid before scoring.
    for (let y = 0; y < CANVAS_SIZE; y += 1) {
      const startDeviceY = Math.floor(y * ratioY);
      const endDeviceY = Math.min(
        actualHeight - 1,
        Math.max(startDeviceY, Math.floor((y + 1) * ratioY) - 1)
      );
      for (let x = 0; x < CANVAS_SIZE; x += 1) {
        const startDeviceX = Math.floor(x * ratioX);
        const endDeviceX = Math.min(
          actualWidth - 1,
          Math.max(startDeviceX, Math.floor((x + 1) * ratioX) - 1)
        );

        let drawn = false;
        for (let deviceY = startDeviceY; deviceY <= endDeviceY && !drawn; deviceY += 1) {
          for (let deviceX = startDeviceX; deviceX <= endDeviceX; deviceX += 1) {
            const alpha = sketchData[(deviceY * actualWidth + deviceX) * 4 + 3];
            if (alpha > SKETCH_ALPHA_THRESHOLD) {
              drawn = true;
              break;
            }
          }
        }

        if (drawn) {
          drawnPixels += 1;
          const maskIndex = y * CANVAS_SIZE + x;
          if (shape.tightMask[maskIndex]) {
            outlineHits += 1;
          }
          if (!shape.looseMask[maskIndex]) {
            strayPixels += 1;
          }
        }
      }
    }

    const coverage = shape.tightMaskCount === 0 ? 0 : outlineHits / shape.tightMaskCount;
    const strayRatio = drawnPixels === 0 ? 0 : strayPixels / drawnPixels;
    const accuracy = Math.max(0, coverage - strayRatio * 0.25);
    const reward = Math.max(10, Math.round(accuracy * 140 + coverage * 40));

    renderReferenceOverlay();

    if (coverage < 0.2 || accuracy < 0.1) {
      failRound(`Outline missed ${formatAccuracy(coverage)}}`, {
        keepReference: true,
      });
      return;
    }

    setScore((current) => current + reward);
    setStreak((current) => current + 1);
    setStatus("result");

    roundTimeoutRef.current = window.setTimeout(() => {
      beginPreview();
    }, 1400);
  }, [beginPreview, failRound, renderReferenceOverlay]);

  useEffect(() => {
    if (status !== "drawing") {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }
    const start = performance.now();
    const deadline = start + DRAW_WINDOW;

    const tick = (time: number) => {
      const ratio = Math.max(0, Math.min(1, (deadline - time) / DRAW_WINDOW));
      setProgress(ratio);
      if (ratio <= 0) {
        failRound("Time ran out");
        return;
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [failRound, status]);

  const beginGame = useCallback(() => {
    setScore(0);
    setStreak(0);
    setFailureReason(null);
    beginPreview();
  }, [beginPreview]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (status !== "drawing") {
        return;
      }
      event.preventDefault();
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) {
        return;
      }
      canvas.setPointerCapture(event.pointerId);
      drawingActiveRef.current = true;
      setHasSketch(true);

      const point = getCanvasPoint(event.nativeEvent);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#f8fafc";
      ctx.shadowBlur = 6 * pixelRatioRef.current;
      ctx.shadowColor = "rgba(248,250,252,0.35)";
    },
    [getCanvasPoint, status]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingActiveRef.current || status !== "drawing") {
        return;
      }
      const ctx = ctxRef.current;
      if (!ctx) {
        return;
      }
      const point = getCanvasPoint(event.nativeEvent);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
    },
    [getCanvasPoint, status]
  );

  const finishStroke = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingActiveRef.current) {
      return;
    }
    drawingActiveRef.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // ignore if pointer was not captured
      }
    }
    const ctx = ctxRef.current;
    ctx?.beginPath();
  }, []);

  const handleSubmit = useCallback(() => {
    if (status !== "drawing" || !hasSketch) {
      return;
    }
    evaluateSketch();
  }, [evaluateSketch, hasSketch, status]);

  const handleClear = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) {
      return;
    }
    clearCanvas(ctx);
    setHasSketch(false);
    drawingActiveRef.current = false;
  }, []);

  const previewCountdownLabel = useMemo(
    () => Math.max(0, previewCountdown).toFixed(1),
    [previewCountdown]
  );

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div
          className="absolute inset-0 opacity-30 blur-3xl"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, rgba(94,234,212,0.12), transparent 55%), radial-gradient(circle at 80% 30%, rgba(244,114,182,0.12), transparent 60%), radial-gradient(circle at 50% 80%, rgba(56,189,248,0.18), transparent 55%)",
          }}
        />
      </div>
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-10 px-6 py-12 sm:px-10">
        <header className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-white/70">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-white/70 transition hover:border-white/40 hover:text-white"
            >
              <span aria-hidden>←</span>
              Back to weekly hub
            </Link>
            <div className="flex w-full flex-col items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/60 sm:w-auto sm:items-end">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:flex-nowrap sm:justify-end sm:gap-3">
                <div className="rounded-full border border-white/10 px-4 py-2 text-white/80">
                  Score <span className="font-mono text-white/60">{score}</span>
                </div>
                <div className="rounded-full border border-white/5 px-4 py-2 text-white/60">
                  Best <span className="font-mono text-white">{highScore}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
                <span className="rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-white/70">
                  Streak ×{streak}
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-white/70">
                  Stage {Math.max(1, streak + 1)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-xs uppercase tracking-[0.35em] text-white/60">Wednesday</span>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">Chroma Trace</h1>
            <p className="max-w-2xl text-sm text-white/70 sm:text-base">
              Memorize the flash of color, redraw it from memory, and chase high accuracy before the shapes shift again.
            </p>
          </div>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center gap-10">
          <div className="relative flex flex-col items-center gap-6">
            <div className="relative flex h-[20rem] w-[20rem] items-center justify-center rounded-3xl">
              <div className="absolute inset-0 rounded-[2.75rem] border border-white/10 bg-slate-900/40 backdrop-blur-xl" />
              <canvas
                ref={backgroundCanvasRef}
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[5] h-[20rem] w-[20rem] rounded-[2.5rem] bg-transparent"
              />
              <canvas
                ref={canvasRef}
                className="relative z-10 h-[20rem] w-[20rem] rounded-[2.5rem] border border-white/20 bg-transparent shadow-[0_40px_80px_rgba(15,23,42,0.55)] transition touch-none cursor-crosshair"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishStroke}
                onPointerLeave={finishStroke}
                onPointerCancel={finishStroke}
                onContextMenu={(event) => event.preventDefault()}
              />
              {status === "preview" && (
                <div className="pointer-events-none absolute right-5 top-5 z-20 rounded-full bg-slate-950/70 px-3 py-1 text-[0.65rem] uppercase tracking-[0.35em] text-white/80">
                  {previewCountdownLabel}s
                </div>
              )}
              {status === "over" && failureReason && (
                <div className="pointer-events-none absolute left-1/2 top-5 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-rose-400/30 bg-rose-500/20 px-7 py-1 text-[0.65rem] uppercase tracking-[0.2em] text-rose-100 shadow-[0_0_25px_rgba(244,114,182,0.35)] whitespace-nowrap">
                  <span>{failureReason}</span>
                </div>
              )}
              {status === "result" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[2.5rem] bg-emerald-500/20 text-sm uppercase tracking-[0.3em] text-emerald-200 backdrop-blur-sm">
                  Nice trace
                </div>
              )}
              {status === "over" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[2.5rem] bg-rose-500/20 text-sm uppercase tracking-[0.3em] text-rose-200 backdrop-blur-sm">
                  Run ended
                </div>
              )}
            </div>
            <div className="flex h-1 w-48 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-full origin-left bg-white/60 transition-transform" style={{ transform: `scaleX(${progress})` }} />
            </div>

            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-white/60">
              <button
                type="button"
                onClick={handleClear}
                className="rounded-full border border-white/10 px-4 py-2 text-white/70 transition hover:border-white/30 hover:text-white"
              >
                Clear sketch
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={status !== "drawing" || !hasSketch}
                className="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-white transition hover:border-white/40 hover:bg-white/20 disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/30"
              >
                Submit guess
              </button>
            </div>
          </div>

          {status === "intro" && (
            <div className="flex flex-col items-center gap-4 text-center text-sm text-white/70 sm:text-base">
              <p>
                Study each flash, then recreate it from memory. Keep accuracy high to build a streak and unlock tougher colors.
              </p>
              <button
                type="button"
                onClick={beginGame}
                className="rounded-full border border-white/20 bg-white/10 px-8 py-3 text-sm font-semibold uppercase tracking-[0.4em] text-white shadow-[0_12px_40px_rgba(56,189,248,0.25)] transition hover:border-white/40 hover:bg-white/20"
              >
                Start session
              </button>
            </div>
          )}

          {status === "over" && (
            <div className="flex flex-col items-center gap-5 text-center text-sm text-white/70 sm:text-base">
              {!failureReason && (
                <div className="flex flex-col items-center gap-2 text-white">
                  <p className="text-lg font-semibold text-white/90">Shape drifted too far</p>
                </div>
              )}
              <button
                type="button"
                onClick={beginGame}
                className="rounded-full border border-white/20 bg-white/10 px-8 py-3 text-sm font-semibold uppercase tracking-[0.4em] text-white transition hover:border-white/40 hover:bg-white/20"
              >
                Replay
              </button>
            </div>
          )}
        </section>

        <footer className="flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-6 text-xs uppercase tracking-[0.3em] text-white/50 sm:flex-row">
          <Link href="/" className="rounded-full border border-white/10 px-4 py-2 text-white/70 transition hover:border-white/30 hover:text-white">
            Back to hub
          </Link>
          <div className="text-center sm:text-right">
            <p>Memorize the flash · Drawing must cover 55%+ of the shape · Overdraw hurts your score</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
