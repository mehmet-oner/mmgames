"use client";

import Link from "next/link";
import type React from "react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Point = { x: number; y: number };
type Direction = "up" | "down" | "left" | "right";
type Status = "idle" | "playing" | "over" | "quiz";

const BOARD_SIZE = 14;
const SPEED = 250;
const EXPRESSIONS = [
  { symbol: "😀", label: "Grinning face" },
  { symbol: "😎", label: "Cool face" },
  { symbol: "😢", label: "Crying face" },
  { symbol: "😡", label: "Angry face" },
  { symbol: "😱", label: "Screaming face" },
  { symbol: "🤢", label: "Nauseated face" },
  { symbol: "😍", label: "Heart eyes" },
  { symbol: "🤔", label: "Thinking face" },
  { symbol: "😴", label: "Sleepy face" },
  { symbol: "😅", label: "Nervous grin" },
  { symbol: "😇", label: "Innocent face" },
  { symbol: "😈", label: "Mischievous grin" },
  { symbol: "🥳", label: "Party face" },
  { symbol: "😤", label: "Triumphant face" },
  { symbol: "🤯", label: "Mind blown" },
  { symbol: "😭", label: "Loudly crying" },
  { symbol: "🤠", label: "Cowboy grin" },
  { symbol: "🥺", label: "Pleading face" },
  { symbol: "🤤", label: "Drooling face" },
  { symbol: "🤪", label: "Zany face" },
] as const;

type Expression = (typeof EXPRESSIONS)[number];

type QuizOption = {
  id: string;
  label: string;
  correct: boolean;
};

type QuizState = {
  expression: Expression;
  options: QuizOption[];
};

const directionVectors: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const keyToDirection: Partial<Record<string, Direction>> = {
  ArrowUp: "up",
  w: "up",
  W: "up",
  ArrowDown: "down",
  s: "down",
  S: "down",
  ArrowLeft: "left",
  a: "left",
  A: "left",
  ArrowRight: "right",
  d: "right",
  D: "right",
};

const isOpposite = (current: Direction, next: Direction) => {
  return (
    (current === "up" && next === "down") ||
    (current === "down" && next === "up") ||
    (current === "left" && next === "right") ||
    (current === "right" && next === "left")
  );
};

const pickExpression = () => EXPRESSIONS[Math.floor(Math.random() * EXPRESSIONS.length)];

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const buildQuizOptions = (expression: Expression): QuizOption[] => {
  const incorrectPool = EXPRESSIONS.filter((item) => item.symbol !== expression.symbol);
  const fallback = incorrectPool.length > 0 ? incorrectPool[Math.floor(Math.random() * incorrectPool.length)] : expression;
  const decoy = incorrectPool.length > 0 ? fallback : expression;
  const options: QuizOption[] = [
    { id: `${expression.symbol}-correct`, label: expression.label, correct: true },
    { id: `${expression.symbol}-decoy`, label: decoy.label, correct: false },
  ];
  return shuffle(options);
};

const spawnFood = (snake: Point[]): Point => {
  const occupied = new Set(snake.map((segment) => `${segment.x}-${segment.y}`));
  const available: Point[] = [];

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const key = `${x}-${y}`;
      if (!occupied.has(key)) {
        available.push({ x, y });
      }
    }
  }

  if (available.length === 0) {
    return snake[0] ?? { x: 0, y: 0 };
  }

  return available[Math.floor(Math.random() * available.length)];
};

type GameState = {
  snake: Point[];
  direction: Direction;
  food: Point;
  emoji: Expression;
  score: number;
  status: Status;
  quiz: QuizState | null;
};

const buildInitialState = (status: Status = "idle"): GameState => {
  const center = Math.floor(BOARD_SIZE / 2);
  const snake: Point[] = [
    { x: center, y: center },
    { x: center - 1, y: center },
    { x: center - 2, y: center },
  ];

  return {
    snake,
    direction: "right",
    food: spawnFood(snake),
    emoji: pickExpression(),
    score: 0,
    status,
    quiz: null,
  };
};

export default function SnakemojiGame() {
  const [state, setState] = useState<GameState>(() => buildInitialState());
  const [highScore, setHighScore] = useState(0);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const requestDirectionChange = useCallback((nextDirection: Direction) => {
    setState((current) => {
      if (current.status === "idle") {
        if (isOpposite(current.direction, nextDirection)) {
          return { ...current, status: "playing" };
        }
        return { ...current, direction: nextDirection, status: "playing" };
      }

      if (current.status !== "playing") {
        return current;
      }

      if (isOpposite(current.direction, nextDirection)) {
        return current;
      }

      return { ...current, direction: nextDirection };
    });
  }, []);

  useEffect(() => {
    if (state.score > highScore) {
      setHighScore(state.score);
    }
  }, [state.score, highScore]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === " ") {
        event.preventDefault();
        setState((current) => {
          if (current.status === "playing") {
            return current;
          }

          if (current.status === "idle") {
            return { ...current, status: "playing" };
          }

          return buildInitialState("playing");
        });
        return;
      }

      const nextDirection = keyToDirection[event.key];
      if (!nextDirection) {
        return;
      }

      if (event.key.startsWith("Arrow")) {
        event.preventDefault();
      }

      requestDirectionChange(nextDirection);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestDirectionChange]);

  useEffect(() => {
    if (state.status !== "playing") {
      return;
    }

    const interval = window.setInterval(() => {
      setState((current) => {
        if (current.status !== "playing") {
          return current;
        }

        const movement = directionVectors[current.direction];
        const nextHead = {
          x: current.snake[0].x + movement.x,
          y: current.snake[0].y + movement.y,
        };

        const hitsWall =
          nextHead.x < 0 || nextHead.x >= BOARD_SIZE || nextHead.y < 0 || nextHead.y >= BOARD_SIZE;

        const willEat = nextHead.x === current.food.x && nextHead.y === current.food.y;
        const bodyToCheck = willEat ? current.snake : current.snake.slice(0, -1);
        const hitsSelf = bodyToCheck.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);

        if (hitsWall || hitsSelf) {
          return { ...current, status: "over" };
        }

        const grownSnake = [nextHead, ...current.snake];
        const nextSnake = willEat ? grownSnake : grownSnake.slice(0, -1);

        if (willEat) {
          const consumedExpression = current.emoji;
          const nextFood = spawnFood(nextSnake);
          const nextExpression = pickExpression();
          return {
            ...current,
            snake: nextSnake,
            food: nextFood,
            emoji: nextExpression,
            score: current.score + 1,
            status: "quiz",
            quiz: {
              expression: consumedExpression,
              options: buildQuizOptions(consumedExpression),
            },
          };
        }

        return { ...current, snake: nextSnake };
      });
    }, SPEED);

    return () => window.clearInterval(interval);
  }, [state.status]);

  const snakeSet = useMemo(() => new Set(state.snake.map((segment) => `${segment.x}-${segment.y}`)), [state.snake]);
  const headKey = `${state.snake[0].x}-${state.snake[0].y}`;

  const handleDirectionTap = useCallback(
    (direction: Direction) => {
      requestDirectionChange(direction);
    },
    [requestDirectionChange],
  );

  const handleQuizAnswer = (option: QuizOption) => {
    setState((current) => {
      if (current.status !== "quiz" || !current.quiz) {
        return current;
      }

      if (option.correct) {
        return {
          ...current,
          status: "playing",
          quiz: null,
        };
      }

      return {
        ...current,
        status: "over",
        quiz: null,
      };
    });
  };

  const handleRestart = () => {
    setState(buildInitialState("playing"));
  };

  const handleResume = () => {
    setState((current) => {
      if (current.status === "playing") {
        return current;
      }

      if (current.status === "idle") {
        return { ...current, status: "playing" };
      }

      return buildInitialState("playing");
    });
  };

  const shouldIgnoreTouch = (event: React.TouchEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return false;
    }
    return Boolean(target.closest("[data-swipe-ignore='true']"));
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (shouldIgnoreTouch(event)) {
      setTouchStart(null);
      return;
    }

    event.preventDefault();
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (shouldIgnoreTouch(event)) {
      setTouchStart(null);
      return;
    }

    event.preventDefault();
    if (!touchStart) {
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) {
      setTouchStart(null);
      return;
    }

    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const threshold = 24;

    if (absX < threshold && absY < threshold) {
      setTouchStart(null);
      return;
    }

    const nextDirection: Direction = absX > absY ? (deltaX > 0 ? "right" : "left") : deltaY > 0 ? "down" : "up";
    requestDirectionChange(nextDirection);
    setTouchStart(null);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (shouldIgnoreTouch(event)) {
      return;
    }

    event.preventDefault();
  };

  const showStatusOverlay = state.status === "idle" || state.status === "over";
  const overlayTitle = state.status === "over" ? "Game over" : "Ready";
  const overlaySubtitle =
    state.status === "over"
      ? `You reached ${state.score} point${state.score === 1 ? "" : "s"}.`
      : "Press an arrow key or tap start to glide. Match the faces to keep moving.";
  const overlayCta = state.status === "over" ? "Play again" : "Start";
  const controlButtonClass =
    "rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-lg text-white transition active:translate-y-[1px] active:border-white/40 active:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-10 px-6 py-14 sm:px-10 lg:px-16">
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted/70">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-muted/70 transition hover:border-white/40 hover:text-white"
          data-swipe-ignore="true"
        >
          <span aria-hidden>←</span>
          Back to weekly hub
        </Link>
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-white/10 px-4 py-2 text-white/80" data-swipe-ignore="true">
            Score <span className="font-mono text-muted/70">{state.score}</span>
          </div>
          <div className="rounded-full border border-white/5 px-4 py-2 text-muted/60" data-swipe-ignore="true">
            Best <span className="font-mono">{highScore}</span>
          </div>
        </div>
      </div>

      <header className="flex flex-col gap-3">
        <span className="text-xs uppercase tracking-[0.35em] text-muted/70">Monday</span>
        <h1 className="text-4xl font-semibold text-white sm:text-5xl">Snakemoji</h1>
        <p className="max-w-2xl text-sm text-muted sm:text-base">
          Guide the neon snake, snack on vibrant emojis, and keep momentum without clashing into walls or yourself.        </p>
      </header>

      <div className="relative mx-auto w-full max-w-lg">
        <div
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: BOARD_SIZE }).map((_, y) =>
              Array.from({ length: BOARD_SIZE }).map((__, x) => {
                const key = `${x}-${y}`;
                const isHead = key === headKey;
                const isSnake = snakeSet.has(key);
                const isFood = state.food.x === x && state.food.y === y;

                let cellClass = "relative aspect-square overflow-hidden rounded-2xl border border-white/5 bg-black/20";
                let content: ReactNode = null;

                if (isSnake) {
                  cellClass = "relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-white/80";
                  content = (
                    <span
                      className={`flex h-full w-full items-center justify-center text-sm font-semibold ${
                        isHead ? "text-slate-900" : "text-slate-700"
                      }`}
                    >
                      {isHead ? "●" : ""}
                    </span>
                  );
                } else if (isFood) {
                  cellClass = "relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-accent/20";
                  content = (
                    <span className="flex h-full w-full items-center justify-center text-xl">{state.emoji.symbol}</span>
                  );
                }

                return (
                  <div key={key} className={cellClass}>
                    {content}
                  </div>
                );
              }),
            )}
          </div>

          {showStatusOverlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 text-center backdrop-blur-sm">
              <div className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-[0.3em] text-muted/60">{overlayTitle}</span>
                <span className="text-lg font-medium text-white">{overlaySubtitle}</span>
              </div>
              <button
                onClick={handleResume}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-white transition hover:border-white/60"
                data-swipe-ignore="true"
              >
                {overlayCta}
                <span aria-hidden className="text-white/60">
                  →
                </span>
              </button>
              <p className="text-[0.7rem] uppercase tracking-[0.3em] text-muted/60">
                arrows · wasd · space · swipe · quiz
              </p>
            </div>
          )}
          {state.status === "quiz" && state.quiz && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/80 text-center backdrop-blur-sm"
              data-swipe-ignore="true"
            >
              <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-white/10 bg-slate-950/90 p-6">
                <span className="text-5xl" aria-label={state.quiz.expression.label} role="img">
                  {state.quiz.expression.symbol}
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-[0.3em] text-muted/60">Face check</span>
                  <span className="text-base font-medium text-white">Which feeling fits this emoji?</span>
                </div>
                <div className="flex w-full flex-col gap-3">
                  {state.quiz.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleQuizAnswer(option)}
                      className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/20"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-[0.65rem] uppercase tracking-[0.3em] text-muted/60">
                  Pick right to keep gliding
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-xs flex-col items-center gap-3 sm:hidden" data-swipe-ignore="true">
        <span className="text-[0.65rem] uppercase tracking-[0.3em] text-muted/60">Tap to steer</span>
        <div className="grid w-full grid-cols-3 gap-3">
          <div />
          <button
            type="button"
            onClick={() => handleDirectionTap("up")}
            className={controlButtonClass}
            aria-label="Move up"
            disabled={state.status !== "playing"}
          >
            ↑
          </button>
          <div />
          <button
            type="button"
            onClick={() => handleDirectionTap("left")}
            className={controlButtonClass}
            aria-label="Move left"
            disabled={state.status !== "playing"}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => handleDirectionTap("down")}
            className={controlButtonClass}
            aria-label="Move down"
            disabled={state.status !== "playing"}
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => handleDirectionTap("right")}
            className={controlButtonClass}
            aria-label="Move right"
            disabled={state.status !== "playing"}
          >
            →
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-muted/60">
        <div>Collect emojis to extend your trail. Match each mood to keep the run alive.</div>
        <button
          onClick={handleRestart}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-muted/70 transition hover:border-white/40 hover:text-white"
          data-swipe-ignore="true"
        >
          Restart fresh
          <span aria-hidden className="text-white/60">↻</span>
        </button>
      </div>
    </div>
  );
}
