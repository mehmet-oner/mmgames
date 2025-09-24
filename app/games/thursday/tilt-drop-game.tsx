"use client";

import type React from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GameStatus = "intro" | "playing" | "over";

type Point = {
  x: number;
  y: number;
};

type Cell = {
  color: string;
  glow: string;
} | null;

type PieceShape = {
  id: string;
  name: string;
  color: string;
  glow: string;
  rotations: Point[][];
};

type ActivePiece = {
  shape: PieceShape;
  rotation: number;
  position: Point;
};

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const INITIAL_DROP_DELAY = 820;
const DROP_DECAY = 0.78;
const MIN_DROP_DELAY = 120;
const LINES_PER_LEVEL = 6;
const DROP_HOLD_DELAY_MS = 200;
const DROP_HOLD_INTERVAL_MS = 90;

const LINE_SCORES = [0, 120, 300, 700, 1200];

const createEmptyBoard = (): Cell[][] =>
  Array.from({ length: BOARD_HEIGHT }, () => Array.from({ length: BOARD_WIDTH }, () => null));

const normalizePoints = (points: Point[]): Point[] => {
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  return points.map((point) => ({ x: point.x - minX, y: point.y - minY }));
};

const rotationsEqual = (a: Point[], b: Point[]) => {
  if (a.length !== b.length) {
    return false;
  }
  const sortPoints = (collection: Point[]) =>
    [...collection].sort((left, right) => (left.y - right.y === 0 ? left.x - right.x : left.y - right.y));
  const sortedA = sortPoints(a);
  const sortedB = sortPoints(b);
  return sortedA.every((point, index) => {
    const candidate = sortedB[index];
    return point.x === candidate.x && point.y === candidate.y;
  });
};

const patternToPoints = (pattern: string[]): Point[] => {
  const points: Point[] = [];
  pattern.forEach((row, y) => {
    row.split("").forEach((cell, x) => {
      if (cell === "#") {
        points.push({ x, y });
      }
    });
  });
  return points;
};

const rotatePoints = (points: Point[], size: number): Point[] =>
  points.map((point) => ({ x: size - 1 - point.y, y: point.x }));

const buildRotations = (pattern: string[]): Point[][] => {
  const size = pattern.length;
  let current = normalizePoints(patternToPoints(pattern));
  const rotations: Point[][] = [];
  for (let index = 0; index < 4; index += 1) {
    if (!rotations.some((existing) => rotationsEqual(existing, current))) {
      rotations.push(current);
    }
    current = normalizePoints(rotatePoints(current, size));
  }
  return rotations;
};

const RAW_SHAPES: Array<{ id: string; name: string; color: string; glow: string; pattern: string[] }> = [
  {
    id: "i",
    name: "Ion Beam",
    color: "#38bdf8",
    glow: "rgba(56,189,248,0.45)",
    pattern: [
      "....",
      "####",
      "....",
      "....",
    ],
  },
  {
    id: "o",
    name: "Core",
    color: "#facc15",
    glow: "rgba(250,204,21,0.45)",
    pattern: [
      "....",
      ".##.",
      ".##.",
      "....",
    ],
  },
  {
    id: "t",
    name: "Flux",
    color: "#c084fc",
    glow: "rgba(192,132,252,0.45)",
    pattern: [
      "....",
      ".###",
      "..#.",
      "....",
    ],
  },
  {
    id: "l",
    name: "Drift",
    color: "#fb923c",
    glow: "rgba(251,146,60,0.45)",
    pattern: [
      "..#.",
      "..#.",
      "..##",
      "....",
    ],
  },
  {
    id: "j",
    name: "Hook",
    color: "#60a5fa",
    glow: "rgba(96,165,250,0.45)",
    pattern: [
      ".#..",
      ".#..",
      "##..",
      "....",
    ],
  },
  {
    id: "s",
    name: "Wave",
    color: "#34d399",
    glow: "rgba(52,211,153,0.45)",
    pattern: [
      "..##",
      ".##.",
      "....",
      "....",
    ],
  },
  {
    id: "z",
    name: "Zing",
    color: "#fb7185",
    glow: "rgba(251,113,133,0.45)",
    pattern: [
      ".##.",
      "..##",
      "....",
      "....",
    ],
  },
];

const SHAPES: PieceShape[] = RAW_SHAPES.map((shape) => ({
  id: shape.id,
  name: shape.name,
  color: shape.color,
  glow: shape.glow,
  rotations: buildRotations(shape.pattern),
}));

const randomShape = () => SHAPES[Math.floor(Math.random() * SHAPES.length)];

const getSpawnPosition = (shape: PieceShape): Point => {
  const rotation = shape.rotations[0];
  const width = rotation.reduce((max, point) => Math.max(max, point.x), 0) + 1;
  const centered = Math.floor((BOARD_WIDTH - width) / 2);
  return { x: centered, y: -2 };
};

const canPlace = (board: Cell[][], shape: PieceShape, position: Point, rotationIndex: number) => {
  const rotation = shape.rotations[rotationIndex];
  return rotation.every((offset) => {
    const x = offset.x + position.x;
    const y = offset.y + position.y;
    if (x < 0 || x >= BOARD_WIDTH) {
      return false;
    }
    if (y >= BOARD_HEIGHT) {
      return false;
    }
    if (y < 0) {
      return true;
    }
    return board[y][x] === null;
  });
};

const mergePiece = (board: Cell[][], piece: ActivePiece) => {
  const nextBoard = board.map((row) => row.slice());
  piece.shape.rotations[piece.rotation].forEach((offset) => {
    const x = offset.x + piece.position.x;
    const y = offset.y + piece.position.y;
    if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
      nextBoard[y][x] = { color: piece.shape.color, glow: piece.shape.glow };
    }
  });
  return nextBoard;
};

const clearLines = (board: Cell[][]) => {
  const remaining: Cell[][] = [];
  let cleared = 0;
  board.forEach((row) => {
    if (row.every((cell) => cell !== null)) {
      cleared += 1;
    } else {
      remaining.push(row);
    }
  });
  while (remaining.length < BOARD_HEIGHT) {
    remaining.unshift(Array.from({ length: BOARD_WIDTH }, () => null));
  }
  return { board: remaining, cleared };
};

const getDropDelay = (level: number) => Math.max(MIN_DROP_DELAY, INITIAL_DROP_DELAY * Math.pow(DROP_DECAY, level));

export default function TiltDropGame() {
  const [status, setStatus] = useState<GameStatus>("intro");
  const [board, setBoard] = useState<Cell[][]>(() => createEmptyBoard());
  const [activePiece, setActivePiece] = useState<ActivePiece | null>(null);
  const [nextPiece, setNextPiece] = useState<PieceShape>(() => randomShape());
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [linesCleared, setLinesCleared] = useState(0);
  const [level, setLevel] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [tiltActive, setTiltActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const swingTimerRef = useRef<number | null>(null);
  const tiltTimerRef = useRef<number | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const statusRef = useRef<GameStatus>(status);
  const activePieceRef = useRef<ActivePiece | null>(null);
  const pointerDragRef = useRef<
    | {
        startX: number;
        startY: number;
        baseX: number;
        baseY: number;
        shiftX: number;
        shiftY: number;
      }
    | null
  >(null);
  const dropHoldDelayRef = useRef<number | null>(null);
  const dropHoldIntervalRef = useRef<number | null>(null);
  const dropHoldActiveRef = useRef(false);
  const dropPreventClickRef = useRef(false);

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
    }
  }, [score, highScore]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    activePieceRef.current = activePiece;
  }, [activePiece]);

  useEffect(() => {
    return () => {
      if (swingTimerRef.current) {
        window.clearTimeout(swingTimerRef.current);
      }
      if (tiltTimerRef.current) {
        window.clearTimeout(tiltTimerRef.current);
      }
      if (messageTimerRef.current) {
        window.clearTimeout(messageTimerRef.current);
      }
      if (dropHoldDelayRef.current) {
        window.clearTimeout(dropHoldDelayRef.current);
      }
      if (dropHoldIntervalRef.current) {
        window.clearInterval(dropHoldIntervalRef.current);
      }
    };
  }, []);

  const scheduleSwing = useCallback(() => {
    if (swingTimerRef.current) {
      window.clearTimeout(swingTimerRef.current);
    }
    const delay = 5000 + Math.random() * 5000;
    swingTimerRef.current = window.setTimeout(() => {
      const targetTilt = Math.random() * 360 - 180;
      setTiltActive(true);
      setTilt(targetTilt);
      if (tiltTimerRef.current) {
        window.clearTimeout(tiltTimerRef.current);
      }
      tiltTimerRef.current = window.setTimeout(() => {
        setTilt(targetTilt * -0.35);
        tiltTimerRef.current = window.setTimeout(() => {
          setTilt(0);
          setTiltActive(false);
        }, 900);
      }, 1100);
      scheduleSwing();
    }, delay);
  }, []);

  useEffect(() => {
    if (status === "playing") {
      scheduleSwing();
    } else {
      if (swingTimerRef.current) {
        window.clearTimeout(swingTimerRef.current);
        swingTimerRef.current = null;
      }
      if (tiltTimerRef.current) {
        window.clearTimeout(tiltTimerRef.current);
        tiltTimerRef.current = null;
      }
      setTilt(0);
      setTiltActive(false);
    }
  }, [scheduleSwing, status]);

  const beginRun = useCallback(() => {
    const first = randomShape();
    const second = randomShape();
    setBoard(createEmptyBoard());
    setActivePiece({ shape: first, rotation: 0, position: getSpawnPosition(first) });
    setNextPiece(second);
    setScore(0);
    setLinesCleared(0);
    setLevel(0);
    if (messageTimerRef.current) {
      window.clearTimeout(messageTimerRef.current);
      messageTimerRef.current = null;
    }
    setMessage(null);
    setStatus("playing");
  }, []);

  const endRun = useCallback((reason: string) => {
    if (messageTimerRef.current) {
      window.clearTimeout(messageTimerRef.current);
      messageTimerRef.current = null;
    }
    setMessage(reason);
    setStatus("over");
    setActivePiece(null);
  }, []);

  const attemptMove = useCallback(
    (dx: number, dy: number) => {
      if (status !== "playing" || !activePiece) {
        return;
      }
      const candidate = {
        ...activePiece,
        position: { x: activePiece.position.x + dx, y: activePiece.position.y + dy },
      };
      if (canPlace(board, candidate.shape, candidate.position, candidate.rotation)) {
        setActivePiece(candidate);
      } else if (dy !== 0) {
        const merged = mergePiece(board, activePiece);
        const { board: cleaned, cleared } = clearLines(merged);
        const totalLines = linesCleared + cleared;
        const nextLevel = Math.floor(totalLines / LINES_PER_LEVEL);
        const scoreBoost = LINE_SCORES[cleared] ?? 0;
        if (cleared > 0) {
          setLinesCleared(totalLines);
          setLevel(nextLevel);
          setScore((previous) => previous + scoreBoost * (nextLevel + 1));
          if (cleared >= 2) {
            setMessage(`${cleared} lines`);
            if (messageTimerRef.current) {
              window.clearTimeout(messageTimerRef.current);
            }
            messageTimerRef.current = window.setTimeout(() => {
              setMessage(null);
              messageTimerRef.current = null;
            }, 800);
          }
        } else {
          setLinesCleared(totalLines);
        }
        setBoard(cleaned);
        const incoming = nextPiece;
        const upcoming = randomShape();
        const spawn = getSpawnPosition(incoming);
        if (!canPlace(cleaned, incoming, spawn, 0)) {
          endRun("Grid overflow");
          return;
        }
        setActivePiece({ shape: incoming, rotation: 0, position: spawn });
        setNextPiece(upcoming);
      }
    },
    [activePiece, board, endRun, linesCleared, nextPiece, status]
  );

  const stopDropHold = useCallback(() => {
    if (dropHoldDelayRef.current) {
      window.clearTimeout(dropHoldDelayRef.current);
      dropHoldDelayRef.current = null;
    }
    if (dropHoldIntervalRef.current) {
      window.clearInterval(dropHoldIntervalRef.current);
      dropHoldIntervalRef.current = null;
    }
    if (dropHoldActiveRef.current) {
      dropHoldActiveRef.current = false;
      if (statusRef.current === "playing") {
        dropPreventClickRef.current = true;
      }
    } else {
      dropHoldActiveRef.current = false;
    }
  }, []);

  const startDropHold = useCallback(() => {
    dropPreventClickRef.current = false;
    dropHoldActiveRef.current = false;
    if (dropHoldDelayRef.current) {
      window.clearTimeout(dropHoldDelayRef.current);
    }
    if (dropHoldIntervalRef.current) {
      window.clearInterval(dropHoldIntervalRef.current);
    }
    dropHoldDelayRef.current = null;
    dropHoldIntervalRef.current = null;
    if (statusRef.current !== "playing") {
      return;
    }
    dropHoldDelayRef.current = window.setTimeout(() => {
      dropHoldDelayRef.current = null;
      dropHoldActiveRef.current = true;
      attemptMove(0, 1);
      dropHoldIntervalRef.current = window.setInterval(() => {
        attemptMove(0, 1);
      }, DROP_HOLD_INTERVAL_MS);
    }, DROP_HOLD_DELAY_MS);
  }, [attemptMove]);

  const rotatePiece = useCallback(() => {
    if (status !== "playing" || !activePiece) {
      return;
    }
    const nextRotation = (activePiece.rotation + 1) % activePiece.shape.rotations.length;
    if (canPlace(board, activePiece.shape, activePiece.position, nextRotation)) {
      setActivePiece({ ...activePiece, rotation: nextRotation });
      return;
    }
    const kicks = [-1, 1, -2, 2];
    for (const offset of kicks) {
      const shifted = { ...activePiece, rotation: nextRotation, position: { x: activePiece.position.x + offset, y: activePiece.position.y } };
      if (canPlace(board, shifted.shape, shifted.position, shifted.rotation)) {
        setActivePiece(shifted);
        return;
      }
    }
  }, [activePiece, board, status]);

  const hardDrop = useCallback(() => {
    if (status !== "playing" || !activePiece) {
      return;
    }
    let distance = 0;
    while (
      canPlace(
        board,
        activePiece.shape,
        { x: activePiece.position.x, y: activePiece.position.y + distance + 1 },
        activePiece.rotation
      )
    ) {
      distance += 1;
    }
    if (distance > 0) {
      setActivePiece((previous) =>
        previous
          ? {
              ...previous,
              position: { x: previous.position.x, y: previous.position.y + distance },
            }
          : previous
      );
    }
    attemptMove(0, 1);
  }, [activePiece, attemptMove, board, status]);

  useEffect(() => {
    if (status !== "playing" || !activePiece) {
      return;
    }
    const interval = window.setInterval(() => {
      attemptMove(0, 1);
    }, getDropDelay(level));
    return () => window.clearInterval(interval);
  }, [activePiece, attemptMove, level, status]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (status !== "playing") {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        attemptMove(-1, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        attemptMove(1, 0);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        attemptMove(0, 1);
      } else if (event.key === "ArrowUp" || event.key === " ") {
        event.preventDefault();
        rotatePiece();
      } else if (event.key === "Enter") {
        event.preventDefault();
        hardDrop();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [attemptMove, hardDrop, rotatePiece, status]);

  useEffect(() => {
    if (status !== "playing") {
      stopDropHold();
      dropPreventClickRef.current = false;
    }
  }, [status, stopDropHold]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.button && event.button !== 0) {
        return;
      }
      if (statusRef.current !== "playing") {
        pointerStartRef.current = null;
        pointerDragRef.current = null;
        beginRun();
        return;
      }
      const piece = activePieceRef.current;
      if (!piece) {
        return;
      }
      pointerStartRef.current = { x: event.clientX, y: event.clientY, time: performance.now() };
      pointerDragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        baseX: piece.position.x,
        baseY: piece.position.y,
        shiftX: 0,
        shiftY: 0,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [beginRun]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = pointerDragRef.current;
      const piece = activePieceRef.current;
      if (!drag || statusRef.current !== "playing" || !piece) {
        return;
      }
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      const cellWidth = rect.width / BOARD_WIDTH;
      const cellHeight = rect.height / BOARD_HEIGHT;
      const expectedX = drag.baseX + drag.shiftX;
      const expectedY = drag.baseY + drag.shiftY;
      if (piece.position.x !== expectedX || piece.position.y !== expectedY) {
        drag.baseX = piece.position.x - drag.shiftX;
        drag.baseY = piece.position.y - drag.shiftY;
      }

      const rawShiftX = (event.clientX - drag.startX) / cellWidth;
      const rawShiftY = (event.clientY - drag.startY) / cellHeight;
      const desiredShiftX = Math.max(-BOARD_WIDTH, Math.min(BOARD_WIDTH, Math.round(rawShiftX)));
      const desiredShiftY = Math.max(0, Math.floor(rawShiftY + 0.25));

      let nextShiftX = drag.shiftX;
      let nextShiftY = drag.shiftY;
      const canOccupy = (shiftX: number, shiftY: number) =>
        canPlace(
          board,
          piece.shape,
          { x: drag.baseX + shiftX, y: drag.baseY + shiftY },
          piece.rotation
        );

      while (nextShiftX < desiredShiftX) {
        if (canOccupy(nextShiftX + 1, nextShiftY)) {
          nextShiftX += 1;
        } else {
          break;
        }
      }

      while (nextShiftX > desiredShiftX) {
        if (canOccupy(nextShiftX - 1, nextShiftY)) {
          nextShiftX -= 1;
        } else {
          break;
        }
      }

      while (nextShiftY < desiredShiftY) {
        if (canOccupy(nextShiftX, nextShiftY + 1)) {
          nextShiftY += 1;
        } else {
          break;
        }
      }

      if (nextShiftX === drag.shiftX && nextShiftY === drag.shiftY) {
        return;
      }

      drag.shiftX = nextShiftX;
      drag.shiftY = nextShiftY;

      setActivePiece((previous) => {
        if (!previous) {
          return previous;
        }
        return {
          ...previous,
          position: {
            x: drag.baseX + nextShiftX,
            y: drag.baseY + nextShiftY,
          },
        };
      });
    },
    [board]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const drag = pointerDragRef.current;
      pointerDragRef.current = null;
      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      if (!start || statusRef.current !== "playing") {
        return;
      }
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      const duration = performance.now() - start.time;
      const movedViaDrag = drag && (drag.shiftX !== 0 || drag.shiftY !== 0);
      const isTap = Math.abs(deltaX) < 12 && Math.abs(deltaY) < 12 && duration < 260 && !movedViaDrag;
      if (isTap) {
        rotatePiece();
      }
    },
    [rotatePiece]
  );

  const handlePointerCancel = useCallback((event?: React.PointerEvent<HTMLDivElement>) => {
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerStartRef.current = null;
    pointerDragRef.current = null;
  }, []);

  const displayBoard = useMemo(() => {
    const ghost = board.map((row) => row.slice());
    if (!activePiece) {
      return ghost;
    }
    const { shape, rotation } = activePiece;
    const offsets = shape.rotations[rotation];
    offsets.forEach((offset) => {
      const x = offset.x + activePiece.position.x;
      const y = offset.y + activePiece.position.y;
      if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
        ghost[y][x] = { color: shape.color, glow: shape.glow };
      }
    });
    return ghost;
  }, [activePiece, board]);

  const nextPreview = useMemo(() => {
    const grid = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => null as Cell));
    const rotation = nextPiece.rotations[0];
    rotation.forEach((offset) => {
      const x = offset.x;
      const y = offset.y;
      if (y >= 0 && y < 4 && x >= 0 && x < 4) {
        grid[y][x] = { color: nextPiece.color, glow: nextPiece.glow };
      }
    });
    return grid;
  }, [nextPiece]);

  return (
    <div className="min-h-screen overflow-hidden bg-slate-950/90 text-white">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-16 sm:px-10 lg:px-12">
        <header className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-3 text-sm text-white/70">
            <Link
              href="/"
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-white/70 transition hover:border-white/40 hover:text-white"
              data-swipe-ignore="true"
            >
              <span aria-hidden>←</span>
              Back
            </Link>
            <div className="flex flex-1 justify-end">
              <div
                className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap text-xs uppercase tracking-[0.3em] text-white/60"
                data-swipe-ignore="true"
              >
                <span className="rounded-full border border-white/10 px-4 py-2 text-white/70">
                  Score <span className="font-mono text-white">{score}</span>
                </span>
                <span className="rounded-full border border-white/10 px-4 py-2 text-white/60">
                  Best <span className="font-mono text-white">{highScore}</span>
                </span>
                {tiltActive && (
                  <span className="flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-500/10 px-3 py-1 text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.25)]">
                    <span className="text-[0.65rem] uppercase tracking-[0.25em]">Tilt</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-xs uppercase tracking-[0.35em] text-white/60">Thursday</span>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">Tilt Drop</h1>
            <p className="max-w-2xl text-sm text-white/70 sm:text-base">
              Rotate falling blocks with taps, swipe to steer, then brace as the whole grid swings off-axis. Keep your cool through the tilt storms.
            </p>
          </div>
        </header>

        <section className="flex flex-1 touch-none flex-col items-center justify-center gap-10 lg:flex-row lg:items-start">
          <div className="flex flex-col items-center gap-4">
            <div
              className="relative flex h-[26rem] w-[16rem] items-center justify-center rounded-[2.5rem] border border-white/10 bg-slate-900/60 p-3 shadow-[0_40px_80px_rgba(15,23,42,0.55)] backdrop-blur"
            >
              <div
                className="relative h-full w-full overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70"
                style={{
                  transform: `rotate(${tilt}deg)`,
                  transition: "transform 0.65s cubic-bezier(0.22, 1, 0.36, 1)",
                  willChange: "transform",
                }}
              >
                <div
                  className="absolute inset-0 touch-none"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  role="presentation"
                >
                  <div className="grid h-full w-full grid-cols-10 grid-rows-20 gap-[1px] bg-slate-900/70 p-3">
                    {displayBoard.map((row, rowIndex) =>
                      row.map((cell, cellIndex) => (
                        <div
                          key={`${rowIndex}-${cellIndex}`}
                          className="relative flex items-center justify-center rounded-sm bg-slate-900/80"
                        >
                          {cell && (
                            <span
                              className="absolute inset-0 rounded-sm"
                              style={{
                                background: `linear-gradient(135deg, ${cell.color}, ${cell.color}CC)`,
                                boxShadow: `0 0 12px ${cell.glow}`,
                              }}
                            />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
                {status === "intro" && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[2rem] bg-slate-950/80 text-center text-xs uppercase tracking-[0.35em] text-white/80 backdrop-blur-sm">
                    <span>Tap to rotate</span>
                    <span>Swipe to strafe</span>
                    <span>Tilts are coming</span>
                  </div>
                )}
                {status === "over" && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[2rem] bg-rose-500/20 text-center text-xs uppercase tracking-[0.4em] text-rose-100 backdrop-blur">
                    <span>{message ?? "Run ended"}</span>
                    <span className="text-[0.55rem] uppercase tracking-[0.3em] text-rose-50/80">Tap replay</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex w-full items-center justify-center gap-3 text-xs uppercase tracking-[0.3em] text-white/60">
              <button
                type="button"
                onClick={() => {
                  if (status === "playing") {
                    rotatePiece();
                  } else {
                    beginRun();
                  }
                }}
                className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-white transition hover:border-white/30 hover:bg-white/15 select-none"
              >
                {status === "playing" ? "Rotate" : "Start run"}
              </button>
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault();
                  if (event.button && event.button !== 0) {
                    return;
                  }
                  startDropHold();
                }}
                onPointerUp={() => {
                  stopDropHold();
                }}
                onPointerLeave={() => {
                  stopDropHold();
                }}
                onPointerCancel={() => {
                  stopDropHold();
                }}
                onClick={() => {
                  if (status === "playing") {
                    if (dropPreventClickRef.current) {
                      dropPreventClickRef.current = false;
                      return;
                    }
                    dropPreventClickRef.current = false;
                    hardDrop();
                  } else {
                    beginRun();
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                }}
                className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-white transition hover:border-white/30 hover:bg-white/15 select-none"
              >
                {status === "playing" ? "Drop" : "Replay"}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
