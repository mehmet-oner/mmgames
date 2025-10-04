"use client";

import Link from "next/link";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number };

type Target = {
  id: string;
  position: Point;
  basePosition: Point;
  size: number;
  emoji: string;
  hit: boolean;
  motion?: {
    axis: "x" | "y";
    amplitude: number;
    speed: number;
    phase: number;
  };
};

type Obstacle = {
  id: string;
  position: Point;
  width: number;
  height: number;
};

type GameStatus = "ready" | "aiming" | "flying" | "cooldown" | "failed";

const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 320;
const GROUND_Y = CANVAS_HEIGHT - 34;
const SLING_ANCHOR: Point = { x: 90, y: GROUND_Y - 40 };
const MAX_PULL = 115;
const PROJECTILE_RADIUS = 22;
const GRAVITY = 2000; // px/s^2
const VELOCITY_MULTIPLIER = 9.2;
const TRAJECTORY_STEPS = 64;
const TRAJECTORY_INTERVAL = 1 / 55; // seconds per simulated step
const TARGET_SIZE = 48;
const MAX_TARGETS = 3;
const SHOTS_PER_ROUND = 2;

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

const buildObstacle = (level: number): Obstacle | null => {
  if (level < 2) {
    return null;
  }

  const minHeight = 70;
  const maxHeight = 150;
  const levelBoost = Math.min(maxHeight - minHeight, level * 20);
  const rawHeight = minHeight + levelBoost * (0.6 + Math.random() * 0.4);
  const height = Math.max(minHeight, Math.min(maxHeight, rawHeight));
  const width = 16;

  const minX = SLING_ANCHOR.x + 110;
  const maxX = CANVAS_WIDTH - width - 110;
  const positionX = maxX > minX ? minX + Math.random() * (maxX - minX) : minX;

  const maxHover = 120;
  const hoverOffset = Math.random() * maxHover;
  const positionY = Math.max(50, GROUND_Y - height - hoverOffset);

  return {
    id: `pillar-${level}-${Math.random().toString(36).slice(2, 6)}`,
    position: { x: positionX, y: positionY },
    width,
    height,
  };
};

const buildTargets = (level: number, obstacle: Obstacle | null): Target[] => {
  const count = Math.min(MAX_TARGETS, Math.max(2, Math.min(level + 1, SHOTS_PER_ROUND * 2)));
  const targets: Target[] = [];
  const minX = SLING_ANCHOR.x + 70;
  const maxX = CANVAS_WIDTH - TARGET_SIZE - 12;
  const groundY = GROUND_Y - TARGET_SIZE - 6;
  const verticalRange = Math.min(140, 60 + level * 20);
  const minY = Math.max(45, groundY - verticalRange);

  const overlapsExisting = (x: number, y: number) => {
    return targets.some((target) => {
      const dx = target.position.x - x;
      const dy = target.position.y - y;
      return Math.abs(dx) < TARGET_SIZE + 12 && Math.abs(dy) < TARGET_SIZE + 12;
    });
  };

  const intersectsObstacle = (x: number, y: number) => {
    if (!obstacle) {
      return false;
    }
    const horizontalOverlap = x + TARGET_SIZE > obstacle.position.x - 10 && x < obstacle.position.x + obstacle.width + 10;
    if (!horizontalOverlap) {
      return false;
    }
    return y + TARGET_SIZE > obstacle.position.y - 10;
  };

  for (let index = 0; index < count; index += 1) {
    let placed = false;
    for (let attempt = 0; attempt < 36 && !placed; attempt += 1) {
      const spanX = Math.max(10, maxX - minX);
      const randomX = minX + Math.random() * spanX;
      const clampedX = Math.min(maxX, Math.max(minX, randomX));
      const randomY = groundY - Math.random() * verticalRange;
      const clampedY = Math.min(groundY, Math.max(minY, randomY));

      if (overlapsExisting(clampedX, clampedY)) {
        continue;
      }
      if (intersectsObstacle(clampedX, clampedY)) {
        continue;
      }

      const basePosition = { x: clampedX, y: clampedY };
      const target: Target = {
        id: `target-${level}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        position: { ...basePosition },
        basePosition,
        size: TARGET_SIZE,
        emoji: pickEmoji(),
        hit: false,
      };
      targets.push(target);
      placed = true;
    }

    if (!placed) {
      let fallbackX = Math.min(maxX, minX + index * (TARGET_SIZE + 18));
      if (obstacle) {
        const horizontalOverlap =
          fallbackX + TARGET_SIZE > obstacle.position.x - 10 && fallbackX < obstacle.position.x + obstacle.width + 10;
        if (horizontalOverlap) {
          fallbackX = obstacle.position.x - TARGET_SIZE - 16;
        }
      }
      fallbackX = Math.min(maxX, Math.max(minX, fallbackX));

      let fallbackY = groundY - Math.floor(index / 2) * (TARGET_SIZE + 18);
      if (obstacle && fallbackY + TARGET_SIZE > obstacle.position.y - 10) {
        fallbackY = obstacle.position.y - TARGET_SIZE - 12;
      }
      fallbackY = Math.min(groundY, Math.max(minY, fallbackY));

      const basePosition = { x: fallbackX, y: fallbackY };
      const target: Target = {
        id: `target-${level}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        position: { ...basePosition },
        basePosition,
        size: TARGET_SIZE,
        emoji: pickEmoji(),
        hit: false,
      };
      targets.push(target);
    }
  }

  if (level >= 2 && targets.length > 0) {
    const movingIndex = (level + targets.length) % targets.length;
    const movingTarget = targets[movingIndex];
    const horizontalRoomLeft = movingTarget.basePosition.x - minX;
    const horizontalRoomRight = maxX - movingTarget.basePosition.x;
    const verticalRoomUp = movingTarget.basePosition.y - minY;
    const verticalRoomDown = groundY - movingTarget.basePosition.y;

    const horizontalRoom = Math.min(horizontalRoomLeft, horizontalRoomRight);
    const verticalRoom = Math.min(verticalRoomUp, verticalRoomDown);

    const amplitudeForAxis = (axis: "x" | "y") => {
      if (axis === "x") {
        return Math.min(24, horizontalRoom);
      }
      return Math.min(20, verticalRoom);
    };

    let axis: "x" | "y" = Math.random() < 0.5 ? "x" : "y";
    if (amplitudeForAxis(axis) < 6) {
      axis = axis === "x" ? "y" : "x";
    }

    const amplitude = amplitudeForAxis(axis);
    if (amplitude >= 6) {
      movingTarget.motion = {
        axis,
        amplitude,
        speed: 0.8 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
      };
    } else {
      delete movingTarget.motion;
      movingTarget.position = { ...movingTarget.basePosition };
    }
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
  const currentVelocity = { ...velocity };
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

const circleRectIntersect = (center: Point, radius: number, obstacle: Obstacle) => {
  const closestX = Math.max(obstacle.position.x, Math.min(center.x, obstacle.position.x + obstacle.width));
  const closestY = Math.max(obstacle.position.y, Math.min(center.y, obstacle.position.y + obstacle.height));
  const dx = center.x - closestX;
  const dy = center.y - closestY;
  return dx * dx + dy * dy <= radius * radius;
};

export default function AngrymojiGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const dragPointRef = useRef<Point | null>(null);
  const trajectoryRef = useRef<Point[]>([]);
  const draggingRef = useRef(false);
  const statusRef = useRef<GameStatus>("ready");
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);

  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [targetsRemaining, setTargetsRemaining] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Drag and release to launch the 😡");
  const [shotsLeft, setShotsLeft] = useState(SHOTS_PER_ROUND);

  const shotsLeftRef = useRef(SHOTS_PER_ROUND);
  const targetsRef = useRef<Target[]>([]);
  const obstaclesRef = useRef<Obstacle[]>([]);
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
      const obstacle = buildObstacle(nextLevel);
      const newTargets = buildTargets(nextLevel, obstacle);
      targetsRef.current = newTargets;
      obstaclesRef.current = obstacle ? [obstacle] : [];
      setTargetsRemaining(newTargets.length);
      setLevel(nextLevel);
      setShotsLeft(SHOTS_PER_ROUND);
      shotsLeftRef.current = SHOTS_PER_ROUND;
      resetProjectile();
      dragPointRef.current = null;
      draggingRef.current = false;
      trajectoryRef.current = [];
      statusRef.current = "ready";
      lastTimestampRef.current = null;
      setStatusMessage(nextLevel === 1 ? "Drag and release to launch the 😡" : `Level ${nextLevel} · Stack those hits`);
    },
    [clearAllTimeouts, resetProjectile, setShotsLeft],
  );

  const triggerFailure = useCallback(() => {
    if (statusRef.current === "failed") {
      return;
    }
    clearAllTimeouts();
    resetProjectile();
    shotsLeftRef.current = 0;
    setShotsLeft(0);
    statusRef.current = "failed";
    setStatusMessage("Out of slings! Resetting…");
    scheduleTimeout(() => {
      setupLevel(1);
    }, 900);
  }, [clearAllTimeouts, resetProjectile, scheduleTimeout, setShotsLeft, setupLevel]);

  useEffect(() => {
    setupLevel(1);
  }, [setupLevel]);

  useEffect(() => {
    const audio = new Audio("/music1.mp3");
    audio.loop = true;
    audio.volume = 0.35;
    backgroundAudioRef.current = audio;

    const attemptPlay = audio.play();
    if (attemptPlay) {
      attemptPlay.catch(() => {
        // Autoplay can be blocked until user interaction; retry on pointer input.
      });
    }

    return () => {
      if (backgroundAudioRef.current) {
        backgroundAudioRef.current.pause();
        backgroundAudioRef.current.currentTime = 0;
        backgroundAudioRef.current = null;
      }
    };
  }, []);

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

      // obstacles
      obstaclesRef.current.forEach((obstacle) => {
        ctx.save();
        ctx.fillStyle = "rgba(249,115,22,0.55)";
        ctx.strokeStyle = "rgba(251,191,36,0.9)";
        ctx.lineWidth = 3;
        ctx.shadowColor = "rgba(249,115,22,0.45)";
        ctx.shadowBlur = 18;
        ctx.fillRect(obstacle.position.x, obstacle.position.y, obstacle.width, obstacle.height);
        ctx.strokeRect(obstacle.position.x, obstacle.position.y, obstacle.width, obstacle.height);
        ctx.restore();
      });

      // targets
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "38px \"Apple Color Emoji\", \"Segoe UI Emoji\", sans-serif";
      targetsRef.current.forEach((target) => {
        const { position, size, hit, emoji } = target;
        if (hit) {
          return;
        }
        ctx.save();
        ctx.shadowColor = "rgba(251,191,36,0.75)";
        ctx.shadowBlur = 28;
        ctx.strokeStyle = "rgba(15,23,42,0.85)";
        ctx.lineWidth = 3;
        ctx.font = "60px \"Apple Color Emoji\", \"Segoe UI Emoji\", sans-serif";
        ctx.strokeText(emoji, position.x + size / 2, position.y + size / 2);
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
      const timeSeconds = timestamp / 1000;

      targets.forEach((target) => {
        if (target.motion && !target.hit) {
          const { axis, amplitude, speed, phase } = target.motion;
          const offset = Math.sin(timeSeconds * speed + phase) * amplitude;
          if (axis === "x") {
            target.position.x = target.basePosition.x + offset;
            target.position.y = target.basePosition.y;
          } else {
            const minY = Math.max(45, GROUND_Y - TARGET_SIZE - 140);
            const maxY = GROUND_Y - TARGET_SIZE - 6;
            target.position.x = target.basePosition.x;
            target.position.y = Math.min(maxY, Math.max(minY, target.basePosition.y + offset));
          }
        } else {
          target.position.x = target.basePosition.x;
          target.position.y = target.basePosition.y;
        }
      });

      let endReason: "ground" | "bounds" | null = null;

      if (projectile.active) {
        projectile.velocity.y += GRAVITY * delta;
        projectile.position.x += projectile.velocity.x * delta;
        projectile.position.y += projectile.velocity.y * delta;

        obstaclesRef.current.forEach((obstacle) => {
          if (!projectile.active) {
            return;
          }
          if (circleRectIntersect(projectile.position, PROJECTILE_RADIUS, obstacle)) {
            const obstacleCenterX = obstacle.position.x + obstacle.width / 2;
            const obstacleCenterY = obstacle.position.y + obstacle.height / 2;
            const dx = projectile.position.x - obstacleCenterX;
            const dy = projectile.position.y - obstacleCenterY;
            if (Math.abs(dx) > Math.abs(dy)) {
              projectile.velocity.x *= -0.55;
              projectile.position.x = dx > 0
                ? obstacle.position.x + obstacle.width + PROJECTILE_RADIUS
                : obstacle.position.x - PROJECTILE_RADIUS;
            } else {
              projectile.velocity.y *= -0.55;
              projectile.position.y = dy > 0
                ? obstacle.position.y + obstacle.height + PROJECTILE_RADIUS
                : obstacle.position.y - PROJECTILE_RADIUS;
            }
          }
        });

        if (projectile.position.y > GROUND_Y - PROJECTILE_RADIUS) {
          projectile.position.y = GROUND_Y - PROJECTILE_RADIUS;
          projectile.velocity.y *= -0.25;
          projectile.velocity.x *= 0.6;
          if (Math.abs(projectile.velocity.y) < 40) {
            projectile.active = false;
            endReason = "ground";
          }
        }

        if (projectile.position.x > CANVAS_WIDTH + 80 || projectile.position.x < -80 || projectile.position.y < -120) {
          projectile.active = false;
          endReason = "bounds";
        }

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
      }

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
      } else if (!projectile.active && endReason && remaining > 0) {
        if (shotsLeftRef.current <= 0) {
          triggerFailure();
        } else if (statusRef.current !== "cooldown" && statusRef.current !== "failed") {
          statusRef.current = "cooldown";
          const delay = endReason === "ground" ? 600 : 450;
          scheduleTimeout(() => {
            resetProjectile();
            statusRef.current = "ready";
            setStatusMessage(endReason === "ground" ? "Line up the next shot" : "Try another angle");
          }, delay);
        }
      }

      drawScene(ctx);
      animationRef.current = requestAnimationFrame(animationStep);
    },
    [drawScene, level, resetProjectile, scheduleTimeout, setupLevel, triggerFailure],
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
      if (shotsLeftRef.current <= 0) {
        setStatusMessage("No slings left!");
        return;
      }
      const audio = backgroundAudioRef.current;
      if (audio && audio.paused) {
        void audio.play().catch(() => {
          // Allow graceful failure if the browser still blocks playback.
        });
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

      setShotsLeft((current) => {
        const next = Math.max(0, current - 1);
        shotsLeftRef.current = next;
        return next;
      });

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

  const shotsLabel = useMemo(() => {
    if (shotsLeft === 0) {
      return "No shots remaining";
    }
    if (shotsLeft === 1) {
      return "1 shot remaining";
    }
    return `${shotsLeft} shots remaining`;
  }, [shotsLeft]);

  const resetGame = () => {
    clearAllTimeouts();
    shotsLeftRef.current = SHOTS_PER_ROUND;
    setShotsLeft(SHOTS_PER_ROUND);
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
          Pull back the rage sling, dodge blockers, and clear every emoji squad with just two shots.
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
          <span>{shotsLabel}</span>
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
