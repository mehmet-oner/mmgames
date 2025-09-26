"use client";

import Link from "next/link";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number };

type Target = {
  id: string;
  position: Point;
  size: number;
  emoji: string;
  hit: boolean;
};

type GameStatus = "ready" | "aiming" | "flying" | "cooldown";

const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 320;
const GROUND_Y = CANVAS_HEIGHT - 34;
const SLING_ANCHOR: Point = { x: 90, y: GROUND_Y - 40 };
const MAX_PULL = 96;
const PROJECTILE_RADIUS = 22;
const GRAVITY = 2000; // px/s^2
const VELOCITY_MULTIPLIER = 9.2;
const TRAJECTORY_STEPS = 64;
const TRAJECTORY_INTERVAL = 1 / 55; // seconds per simulated step
const TARGET_SIZE = 48;

const TARGET_LAYOUT: Array<{ offsetX: number; offsetY: number }> = [
  { offsetX: 180, offsetY: 0 },
  { offsetX: 180 + TARGET_SIZE + 14, offsetY: 0 },
  { offsetX: 180 + TARGET_SIZE / 2 + 8, offsetY: -(TARGET_SIZE + 14) },
  { offsetX: 180 + TARGET_SIZE * 1.5 + 22, offsetY: -(TARGET_SIZE + 14) },
];

const TARGET_EMOJIS = ["😈", "🤖", "👾", "🥵", "💥", "👹"];

const pickEmoji = () => TARGET_EMOJIS[Math.floor(Math.random() * TARGET_EMOJIS.length)];

const clampPullPoint = (point: Point): Point => {
  const dx = point.x - SLING_ANCHOR.x;
  const dy = point.y - SLING_ANCHOR.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= MAX_PULL) {
    return { x: point.x, y: point.y };
  }
  const ratio = MAX_PULL / distance;
  return {
    x: SLING_ANCHOR.x + dx * ratio,
    y: SLING_ANCHOR.y + dy * ratio,
  };
};

const withinAnchorZone = (point: Point) => {
  const distance = Math.hypot(point.x - SLING_ANCHOR.x, point.y - SLING_ANCHOR.y);
  return distance <= PROJECTILE_RADIUS * 2.2;
};

const buildTargets = (level: number): Target[] => {
  const count = Math.min(3, Math.max(1, level + 1));
  const baseY = GROUND_Y - TARGET_SIZE - 6;
  const targets: Target[] = [];
  for (let index = 0; index < count; index += 1) {
    const layout = TARGET_LAYOUT[index % TARGET_LAYOUT.length];
    const shift = Math.floor(index / TARGET_LAYOUT.length) * (TARGET_SIZE + 12);
    targets.push({
      id: `target-${level}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      position: { x: SLING_ANCHOR.x + layout.offsetX + shift, y: baseY + layout.offsetY },
      size: TARGET_SIZE,
      emoji: pickEmoji(),
      hit: false,
    });
  }
  return targets;
};

const computeVelocityFromPull = (pullPoint: Point) => {
  const pull = { x: pullPoint.x - SLING_ANCHOR.x, y: pullPoint.y - SLING_ANCHOR.y };
  return {
    x: -pull.x * VELOCITY_MULTIPLIER,
    y: -pull.y * VELOCITY_MULTIPLIER,
  };
};

const simulateTrajectory = (start: Point, velocity: Point) => {
  const points: Point[] = [];
  let position = { ...start };
  let currentVelocity = { ...velocity };
  for (let step = 0; step < TRAJECTORY_STEPS; step += 1) {
    currentVelocity.y += GRAVITY * TRAJECTORY_INTERVAL;
    position = {
      x: position.x + currentVelocity.x * TRAJECTORY_INTERVAL,
      y: position.y + currentVelocity.y * TRAJECTORY_INTERVAL,
    };
    if (position.y > GROUND_Y - PROJECTILE_RADIUS) {
      break;
    }
    points.push({ ...position });
  }
  return points;
};

export default function AngrymojiGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const dragPointRef = useRef<Point | null>(null);
  const trajectoryRef = useRef<Point[]>([]);
  const draggingRef = useRef(false);
  const statusRef = useRef<GameStatus>("ready");

  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [targetsRemaining, setTargetsRemaining] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Drag and release to launch the 😡");

  const targetsRef = useRef<Target[]>([]);
  const projectileRef = useRef({
    position: { ...SLING_ANCHOR },
    velocity: { x: 0, y: 0 },
    active: false,
  });
  const timeoutsRef = useRef<number[]>([]);

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  }, []);

  const scheduleTimeout = useCallback((callback: () => void, delay: number) => {
    const timeoutId = window.setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter((id) => id !== timeoutId);
      callback();
    }, delay);
    timeoutsRef.current.push(timeoutId);
    return timeoutId;
  }, []);

  const resetProjectile = useCallback(() => {
    projectileRef.current.position = { ...SLING_ANCHOR };
    projectileRef.current.velocity = { x: 0, y: 0 };
    projectileRef.current.active = false;
  }, []);

  const setupLevel = useCallback(
    (nextLevel: number) => {
      clearAllTimeouts();
      const newTargets = buildTargets(nextLevel);
      targetsRef.current = newTargets;
      setTargetsRemaining(newTargets.length);
      setLevel(nextLevel);
      resetProjectile();
      dragPointRef.current = null;
      draggingRef.current = false;
      trajectoryRef.current = [];
      statusRef.current = "ready";
      lastTimestampRef.current = null;
      setStatusMessage(nextLevel === 1 ? "Drag and release to launch the 😡" : `Level ${nextLevel} · Stack those hits`);
    },
    [clearAllTimeouts, resetProjectile],
  );

  useEffect(() => {
    setupLevel(1);
  }, [setupLevel]);

  const cleanupAnimation = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  const drawScene = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // backdrop
      const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      gradient.addColorStop(0, "rgba(15,23,42,0.85)");
      gradient.addColorStop(1, "rgba(15,23,42,0.2)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // ground
      ctx.fillStyle = "rgba(15,23,42,0.75)";
      ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
      ctx.fillStyle = "rgba(148,163,184,0.2)";
      ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, 4);

      // slingshot base
      ctx.strokeStyle = "rgba(148,163,184,0.4)";
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(SLING_ANCHOR.x - 14, GROUND_Y);
      ctx.lineTo(SLING_ANCHOR.x - 4, SLING_ANCHOR.y + 36);
      ctx.moveTo(SLING_ANCHOR.x + 14, GROUND_Y);
      ctx.lineTo(SLING_ANCHOR.x + 4, SLING_ANCHOR.y + 36);
      ctx.stroke();

      // sling band
      const dragPoint = dragPointRef.current;
      const projectilePosition = projectileRef.current.position;
      const slingPoint = dragPoint && draggingRef.current ? dragPoint : projectilePosition;
      const showBand = draggingRef.current || !projectileRef.current.active;
      if (showBand) {
        ctx.strokeStyle = "rgba(248,250,252,0.45)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(SLING_ANCHOR.x - 6, SLING_ANCHOR.y);
        ctx.lineTo(slingPoint.x, slingPoint.y);
        ctx.lineTo(SLING_ANCHOR.x + 6, SLING_ANCHOR.y);
        ctx.stroke();
      }

      // predicted trajectory
      const trajectory = trajectoryRef.current;
      if (trajectory.length > 1) {
        ctx.save();
        ctx.setLineDash([6, 8]);
        ctx.strokeStyle = "rgba(148,163,184,0.7)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(SLING_ANCHOR.x, SLING_ANCHOR.y);
        trajectory.forEach((point) => {
          ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();
        ctx.restore();
      }

      // targets
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "38px \"Apple Color Emoji\", \"Segoe UI Emoji\", sans-serif";
      targetsRef.current.forEach((target) => {
        const { position, size, hit, emoji } = target;
        ctx.save();
        ctx.globalAlpha = hit ? 0.25 : 1;
        ctx.font = "52px \"Apple Color Emoji\", \"Segoe UI Emoji\", sans-serif";
        ctx.fillText(emoji, position.x + size / 2, position.y + size / 2);
        ctx.restore();
      });

      // projectile (emoji)
      ctx.save();
      ctx.font = "40px \"Apple Color Emoji\", \"Segoe UI Emoji\", sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(248,113,113,0.35)";
      ctx.shadowBlur = 18;
      const projectileEmoji = draggingRef.current ? "😠" : "😡";
      ctx.fillText(projectileEmoji, slingPoint.x, slingPoint.y);
      ctx.restore();
    },
    [],
  );

  const animationStep = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = timestamp;
      }
      const delta = (timestamp - (lastTimestampRef.current ?? timestamp)) / 1000;
      lastTimestampRef.current = timestamp;

      const projectile = projectileRef.current;
      const targets = targetsRef.current;

      if (projectile.active) {
        projectile.velocity.y += GRAVITY * delta;
        projectile.position.x += projectile.velocity.x * delta;
        projectile.position.y += projectile.velocity.y * delta;

        // ground collision
        if (projectile.position.y > GROUND_Y - PROJECTILE_RADIUS) {
          projectile.position.y = GROUND_Y - PROJECTILE_RADIUS;
          projectile.velocity.y *= -0.25;
          projectile.velocity.x *= 0.6;
          if (Math.abs(projectile.velocity.y) < 40) {
            projectile.active = false;
            statusRef.current = "cooldown";
            scheduleTimeout(() => {
              resetProjectile();
              statusRef.current = "ready";
              setStatusMessage("Line up the next shot");
            }, 600);
          }
        }

        // bounds check
        if (projectile.position.x > CANVAS_WIDTH + 80 || projectile.position.x < -80 || projectile.position.y < -120) {
          projectile.active = false;
          statusRef.current = "cooldown";
          scheduleTimeout(() => {
            resetProjectile();
            statusRef.current = "ready";
            setStatusMessage("Try another angle");
          }, 450);
        }

        // target collision detection
        targets.forEach((target) => {
          if (target.hit) {
            return;
          }
          const centerX = target.position.x + target.size / 2;
          const centerY = target.position.y + target.size / 2;
          const distance = Math.hypot(projectile.position.x - centerX, projectile.position.y - centerY);
          if (distance <= PROJECTILE_RADIUS + target.size / 2.4) {
            target.hit = true;
            setScore((current) => current + 1);
            setTargetsRemaining((current) => Math.max(0, current - 1));
            setStatusMessage("Direct hit! 😤");
          }
        });

        const remaining = targets.filter((target) => !target.hit).length;
        if (remaining === 0 && targets.length > 0 && statusRef.current !== "cooldown") {
          statusRef.current = "cooldown";
          setStatusMessage("Rage streak! Next wave");
          projectile.active = false;
          scheduleTimeout(() => {
            resetProjectile();
            statusRef.current = "ready";
            setupLevel(level + 1);
          }, 800);
        }
      }

      drawScene(ctx);
      animationRef.current = requestAnimationFrame(animationStep);
    },
    [drawScene, level, resetProjectile, scheduleTimeout, setupLevel],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return undefined;
    }

    const ratio = window.devicePixelRatio ?? 1;
    canvas.width = CANVAS_WIDTH * ratio;
    canvas.height = CANVAS_HEIGHT * ratio;
    canvas.style.width = `${CANVAS_WIDTH}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(ratio, ratio);
    context.imageSmoothingEnabled = true;

    lastTimestampRef.current = null;
    animationRef.current = requestAnimationFrame(animationStep);

    return () => {
      cleanupAnimation();
      clearAllTimeouts();
    };
  }, [animationStep, cleanupAnimation, clearAllTimeouts]);

  const getCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement> | PointerEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  }, []);

  const updateTrajectory = useCallback((point: Point) => {
    const velocity = computeVelocityFromPull(point);
    trajectoryRef.current = simulateTrajectory(SLING_ANCHOR, velocity);
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (statusRef.current !== "ready" && statusRef.current !== "aiming") {
        return;
      }
      const point = getCanvasPoint(event);
      if (!withinAnchorZone(point)) {
        return;
      }
      event.preventDefault();
      const canvas = canvasRef.current;
      canvas?.setPointerCapture(event.pointerId);
      const clamped = clampPullPoint(point);
      dragPointRef.current = clamped;
      draggingRef.current = true;
      statusRef.current = "aiming";
      updateTrajectory(clamped);
      setStatusMessage("Line up the shot");
    },
    [getCanvasPoint, updateTrajectory],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) {
        return;
      }
      const point = clampPullPoint(getCanvasPoint(event));
      dragPointRef.current = point;
      updateTrajectory(point);
      setStatusMessage("Release to fire");
    },
    [getCanvasPoint, updateTrajectory],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) {
        return;
      }
      draggingRef.current = false;
      const canvas = canvasRef.current;
      try {
        canvas?.releasePointerCapture(event.pointerId);
      } catch {
        // ignore if pointer capture was not set
      }
      const pullPoint = dragPointRef.current ?? { ...SLING_ANCHOR };
      dragPointRef.current = null;
      trajectoryRef.current = [];

      const pullDistance = Math.hypot(pullPoint.x - SLING_ANCHOR.x, pullPoint.y - SLING_ANCHOR.y);
      if (pullDistance < 6) {
        statusRef.current = "ready";
        setStatusMessage("Give it a bigger pull");
        return;
      }

      const velocity = computeVelocityFromPull(pullPoint);
      projectileRef.current.position = { ...SLING_ANCHOR };
      projectileRef.current.velocity = velocity;
      projectileRef.current.active = true;
      statusRef.current = "flying";
      lastTimestampRef.current = null;
      setStatusMessage("Fury unleashed!");
    },
    [],
  );

  const handlePointerCancel = useCallback(() => {
    draggingRef.current = false;
    dragPointRef.current = null;
    trajectoryRef.current = [];
    statusRef.current = "ready";
    setStatusMessage("Launch cancelled");
  }, []);

  const remainingLabel = useMemo(() => {
    if (targetsRemaining <= 0) {
      return "All targets cleared";
    }
    return `${targetsRemaining} target${targetsRemaining === 1 ? "" : "s"} left`;
  }, [targetsRemaining]);

  const resetGame = () => {
    clearAllTimeouts();
    setScore(0);
    setupLevel(1);
    statusRef.current = "ready";
    setStatusMessage("Back to basics · Level 1");
  };

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
        <span className="text-xs uppercase tracking-[0.35em] text-muted/70">Saturday</span>
        <h1 className="text-4xl font-semibold text-white sm:text-5xl">Angrymoji</h1>
        <p className="max-w-2xl text-sm text-muted sm:text-base">
          Pull back the rage sling and launch the 😡 emoji.
        </p>
      </header>

      <div className="relative mx-auto flex w-full max-w-lg flex-col items-center gap-4" data-swipe-ignore="true">
        <canvas
          ref={canvasRef}
          className="h-[320px] w-full max-w-[360px] touch-none rounded-[2.5rem] border border-white/15 bg-slate-900/40 shadow-[0_30px_80px_rgba(15,23,42,0.55)]"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />
        <div className="flex flex-col items-center gap-2 text-center text-xs uppercase tracking-[0.35em] text-muted/60">
          <span>{statusMessage}</span>
          <span>{remainingLabel}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-muted/60">
        <div>Drag from the sling, watch the dashed arc, and unleash emoji mayhem.</div>
        <button
          type="button"
          onClick={resetGame}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-muted/70 transition hover:border-white/40 hover:text-white"
        >
          Reset run
          <span aria-hidden className="text-white/60">↻</span>
        </button>
      </div>
    </div>
  );
}
