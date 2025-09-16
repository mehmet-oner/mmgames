"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GameStatus = "intro" | "playing" | "over";
type ChallengeAction = "tap" | "ignore";

type ColorSlice = {
  id: string;
  name: string;
  value: string;
  glow: string;
};

type Segment = {
  id: string;
  color: ColorSlice;
  startAngle: number;
  endAngle: number;
};

type Challenge = {
  id: number;
  action: ChallengeAction;
  targetSegmentId: string | null;
  targetColor: ColorSlice;
  duration: number;
  fake: boolean;
  instruction: string;
};

type PointerSnapshot = {
  segment: Segment | null;
};

const COLOR_LIBRARY: ColorSlice[] = [
  { id: "sky", name: "Sky", value: "#38bdf8", glow: "rgba(56,189,248,0.45)" },
  { id: "emerald", name: "Emerald", value: "#34d399", glow: "rgba(52,211,153,0.45)" },
  { id: "rose", name: "Rose", value: "#fb7185", glow: "rgba(251,113,133,0.45)" },
  { id: "lime", name: "Lime", value: "#a3e635", glow: "rgba(163,230,53,0.45)" },
  { id: "fuchsia", name: "Fuchsia", value: "#e879f9", glow: "rgba(232,121,249,0.45)" },
  { id: "blue", name: "Blue", value: "#60a5fa", glow: "rgba(96,165,250,0.45)" },
  { id: "orange", name: "Orange", value: "#fb923c", glow: "rgba(251,146,60,0.45)" },
  { id: "teal", name: "Teal", value: "#14b8a6", glow: "rgba(20,184,166,0.45)" },
  { id: "magenta", name: "Magenta", value: "#f472b6", glow: "rgba(244,114,182,0.45)" },
];

const BASE_SCORE = 120;
const SCORE_MULTIPLIER_STEP = 0.25;

const normalizeAngle = (angle: number) => {
  const mod = angle % 360;
  return mod < 0 ? mod + 360 : mod;
};

const pickSegments = (count: number): Segment[] => {
  const pool = [...COLOR_LIBRARY];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  const step = 360 / count;
  const chosen = pool.slice(0, count);
  return chosen.map((color, index) => {
    const startAngle = step * index;
    const endAngle = startAngle + step;
    return {
      id: `${color.id}-${index}`,
      color,
      startAngle,
      endAngle,
    };
  });
};

const buildInstruction = (_action: ChallengeAction, fake: boolean) => {
  if (fake) {
    return "Fake signal · stay cool";
  }

  return "Tap the matching hue";
};

const formatActionLabel = (action: ChallengeAction, fake: boolean) => {
  if (fake) {
    return "Do nothing";
  }

  return "Tap";
};

const describeDifficulty = (intensity: number) => {
  if (intensity > 0.75) return "Inferno";
  if (intensity > 0.55) return "Surge";
  if (intensity > 0.35) return "Flow";
  return "Warmup";
};

export default function ColorsGame() {
  const [status, setStatus] = useState<GameStatus>("intro");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [rotation, setRotation] = useState(() => Math.random() * 360);
  const [speed, setSpeed] = useState(90);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [intensity, setIntensity] = useState(0);
  const [challengeStart, setChallengeStart] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);

  const rotationRef = useRef(rotation);
  const speedRef = useRef(speed);
  const directionRef = useRef(direction);
  const statusRef = useRef<GameStatus>(status);
  const challengeResolvedRef = useRef(false);
  const levelRef = useRef(0);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const frameTimeRef = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  const challengeIdRef = useRef(0);

  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    directionRef.current = direction;
  }, [direction]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
    }
  }, [score, highScore]);

  const pointerSnapshot = useCallback((): PointerSnapshot => {
    if (segments.length === 0) {
      return { segment: null };
    }

    const pointerAngle = normalizeAngle(-rotationRef.current);
    const segment = segments.find((candidate) => {
      const start = normalizeAngle(candidate.startAngle);
      const end = normalizeAngle(candidate.endAngle);
      if (start < end) {
        return pointerAngle >= start && pointerAngle < end;
      }
      return pointerAngle >= start || pointerAngle < end;
    });

    if (!segment) {
      return { segment: null };
    }

    return { segment };
  }, [segments]);

  const isPointerOnTarget = useCallback(
    (currentChallenge: Challenge, snapshot: PointerSnapshot) => {
      if (!snapshot.segment || !currentChallenge.targetSegmentId) {
        return false;
      }

      return snapshot.segment.id === currentChallenge.targetSegmentId;
    },
    []
  );

  const prepareRound = useCallback(
    (levelValue: number) => {
      const previousDirection = directionRef.current;
      const segmentCount = Math.min(
        COLOR_LIBRARY.length - 1,
        Math.max(3, 3 + Math.floor(levelValue / 2))
      );
      const segmentsNext = pickSegments(segmentCount);
      const availableFakeColors = COLOR_LIBRARY.filter((color) =>
        segmentsNext.every((segment) => segment.color.id !== color.id)
      );

      const fakeChance = Math.min(0.12 + levelValue * 0.02, 0.4);
      const shouldFake = availableFakeColors.length > 0 && Math.random() < fakeChance;

      let action: ChallengeAction = "tap";
      let fake = false;

      if (shouldFake) {
        action = "ignore";
        fake = true;
      } else {
        action = "tap";
      }

      let targetSegmentId: string | null = null;
      let targetColor: ColorSlice;

      if (fake) {
        targetColor = availableFakeColors[Math.floor(Math.random() * availableFakeColors.length)];
      } else {
        const picked = segmentsNext[Math.floor(Math.random() * segmentsNext.length)];
        targetSegmentId = picked.id;
        targetColor = picked.color;
      }

      const rawSpeed = 90 + levelValue * 14 + segmentCount * 4;
      const speedNext = Math.min(420, rawSpeed);
      const flipChance = Math.min(0.3 + levelValue * 0.02, 0.65);
      const directionNext: 1 | -1 = Math.random() < flipChance ? (previousDirection === 1 ? -1 : 1) : previousDirection;
      const duration = Math.max(1100, fake ? 1800 : 2200 - levelValue * 70);
      const instruction = buildInstruction(action, fake);
      const challengeId = challengeIdRef.current + 1;
      challengeIdRef.current = challengeId;

      const challengeNext: Challenge = {
        id: challengeId,
        action,
        fake,
        targetSegmentId,
        targetColor,
        duration,
        instruction,
      };

      const now = typeof performance !== "undefined" ? performance.now() : Date.now();

      challengeResolvedRef.current = false;
      setSegments(segmentsNext);
      setChallenge(challengeNext);
      setRotation(() => {
        const initial = normalizeAngle(Math.random() * 360);
        rotationRef.current = initial;
        return initial;
      });
      setSpeed(speedNext);
      setDirection(directionNext);
      speedRef.current = speedNext;
      directionRef.current = directionNext;
      setIntensity(Math.min(1, levelValue / 12));
      setChallengeStart(now);
      setDeadline(now + duration);
      frameTimeRef.current = now;
      setFeedback(null);
      setFailureReason(null);
    },
    []
  );

  const resolveChallenge = useCallback(
    (outcome: "success" | "failure", reason?: string) => {
      if (challengeResolvedRef.current) {
        return;
      }

      challengeResolvedRef.current = true;

      if (outcome === "failure") {
        setFailureReason(reason ?? "Missed the pulse");
        setStatus("over");
        statusRef.current = "over";
        setFeedback(null);
        setMaxCombo((current) => Math.max(current, comboRef.current));
        comboRef.current = 0;
        setCombo(0);
        return;
      }

      const base = BASE_SCORE + levelRef.current * 12;
      const multiplier = 1 + comboRef.current * SCORE_MULTIPLIER_STEP;
      const gained = Math.round(base * multiplier);
      const nextScore = scoreRef.current + gained;
      scoreRef.current = nextScore;
      comboRef.current += 1;
      setCombo(comboRef.current);
      setMaxCombo((current) => Math.max(current, comboRef.current));
      setScore(nextScore);
      setFeedback(`+${gained}`);
      window.setTimeout(() => {
        setFeedback(null);
      }, 600);

      const nextLevel = levelRef.current + 1;
      levelRef.current = nextLevel;

      if (statusRef.current === "playing") {
        window.setTimeout(() => {
          if (statusRef.current === "playing") {
            prepareRound(nextLevel);
          }
        }, 420);
      }
    },
    [prepareRound]
  );

  useEffect(() => {
    if (status !== "playing") {
      return;
    }

    let animationFrame: number;
    let lastTime = typeof performance !== "undefined" ? performance.now() : Date.now();

    const loop = (time: number) => {
      frameTimeRef.current = time;
      const delta = time - lastTime;
      lastTime = time;
      const deltaDegrees = (delta / 1000) * speedRef.current * directionRef.current;
      setRotation((previous) => {
        const next = previous + deltaDegrees;
        const normalized = normalizeAngle(next);
        rotationRef.current = normalized;
        return normalized;
      });
      animationFrame = window.requestAnimationFrame(loop);
    };

    animationFrame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [status]);

  useEffect(() => {
    if (status !== "playing" || !challenge) {
      return;
    }

    const tick = () => {
      if (challengeResolvedRef.current) {
        return;
      }

      const now = typeof performance !== "undefined" ? performance.now() : Date.now();

      if (challenge.action === "ignore") {
        if (now >= deadline) {
          resolveChallenge("success");
          return;
        }
      } else if (now >= deadline) {
        resolveChallenge("failure", "Too slow");
        return;
      }

      if (!challengeResolvedRef.current) {
        window.requestAnimationFrame(tick);
      }
    };

    const animation = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animation);
  }, [challenge, deadline, pointerSnapshot, resolveChallenge, status]);

  const beginGame = useCallback(() => {
    setStatus("playing");
    statusRef.current = "playing";
    scoreRef.current = 0;
    comboRef.current = 0;
    levelRef.current = 0;
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setFeedback(null);
    setFailureReason(null);
    prepareRound(0);
  }, [prepareRound]);

  const handleTap = useCallback(() => {
    if (statusRef.current !== "playing" || !challenge || challengeResolvedRef.current) {
      return;
    }

    if (challenge.fake) {
      resolveChallenge("failure", "Fake cue — stay still next time");
      return;
    }

    const snapshot = pointerSnapshot();
    if (!isPointerOnTarget(challenge, snapshot)) {
      resolveChallenge("failure", "Wrong color");
      return;
    }

    resolveChallenge("success");
  }, [challenge, isPointerOnTarget, pointerSnapshot, resolveChallenge]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        if (statusRef.current === "intro" || statusRef.current === "over") {
          beginGame();
          return;
        }
        handleTap();
      }
      if (event.key === "Escape" && statusRef.current === "playing") {
        setStatus("over");
        statusRef.current = "over";
        setFailureReason("Exited early");
        setMaxCombo((current) => Math.max(current, comboRef.current));
        comboRef.current = 0;
        setCombo(0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [beginGame, handleTap]);

  const gradientStyle = useMemo(() => {
    const focusColor = challenge?.targetColor.glow ?? "rgba(56,189,248,0.3)";
    return {
      background: `radial-gradient(circle at 50% 50%, ${focusColor} ${20 + intensity * 30}%, rgba(10,12,30,0.95) 70%)`,
      transition: "background 280ms ease",
    };
  }, [challenge?.targetColor.glow, intensity]);

  const sliceGradient = useMemo(() => {
    if (segments.length === 0) {
      return undefined;
    }
    const parts = segments
      .map((segment) => {
        const start = segment.startAngle.toFixed(2);
        const end = segment.endAngle.toFixed(2);
        return `${segment.color.value} ${start}deg ${end}deg`;
      })
      .join(", ");
    return `conic-gradient(${parts})`;
  }, [segments]);

  const progress = useMemo(() => {
    if (!challenge) {
      return 1;
    }
    const elapsed = frameTimeRef.current - challengeStart;
    const ratio = 1 - Math.min(1, Math.max(0, elapsed / challenge.duration));
    return ratio;
  }, [challenge, challengeStart]);

  const actionLabel = formatActionLabel(challenge?.action ?? "tap", challenge?.fake ?? false);

  const centerContent = (() => {
    if (feedback) {
      return (
        <div className="relative z-10 text-2xl font-semibold text-emerald-200 drop-shadow-[0_0_12px_rgba(16,185,129,0.6)] transition duration-300">
          {feedback}
        </div>
      );
    }

    if (status === "intro") {
      return (
        <div className="relative z-10 flex flex-col items-center gap-3 text-center">
          <span className="text-[0.7rem] uppercase tracking-[0.4em] text-white/50">Ready to focus</span>
          <button
            type="button"
            onClick={beginGame}
            className="rounded-full border border-white/20 bg-white/10 px-8 py-3 text-sm font-semibold uppercase tracking-[0.4em] text-white shadow-[0_10px_40px_rgba(56,189,248,0.25)] transition hover:border-white/40 hover:bg-white/20"
          >
            Start
          </button>
          <span className="text-[0.6rem] uppercase tracking-[0.4em] text-white/30">Tap to sync with the hue</span>
        </div>
      );
    }

    if (status === "over") {
      return (
        <div className="relative z-10 flex flex-col items-center gap-3 text-center">
          <span className="text-xs uppercase tracking-[0.4em] text-white/50">Run ended</span>
          <p className="max-w-[11rem] text-sm text-white/80">{failureReason ?? "Out of rhythm"}</p>
          <button
            type="button"
            onClick={beginGame}
            className="rounded-full border border-white/20 bg-white/10 px-8 py-3 text-sm font-semibold uppercase tracking-[0.4em] text-white transition hover:border-white/40 hover:bg-white/20"
          >
            Replay
          </button>
        </div>
      );
    }

    return (
      <div className="relative z-10 flex flex-col items-center gap-1 text-xs uppercase tracking-[0.35em] text-white/60">
        <span>{actionLabel}</span>
      </div>
    );
  })();

  const statusMessage = (() => {
    if (status === "intro") {
      return "Tap precisely as the rotating pointer hits the hue. Build streaks, survive the fakes, and keep the spin under control.";
    }

    if (status === "over") {
      return "Check your run stats, then dive back in when you are ready.";
    }

    return challenge?.instruction ?? "Stay sharp for the countdown";
  })();

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-950 text-white" style={gradientStyle}>
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div
          className="absolute inset-0 opacity-30 blur-3xl"
          style={{
            background: `radial-gradient(circle at 20% 20%, rgba(94,234,212,0.12), transparent 55%), radial-gradient(circle at 80% 30%, rgba(239,68,68,0.12), transparent 60%), radial-gradient(circle at 50% 80%, rgba(59,130,246,0.18), transparent 55%)`,
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
                <span className="rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-white/70">Combo ×{combo}</span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-white/70">Phase {describeDifficulty(intensity)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-xs uppercase tracking-[0.35em] text-white/60">Tuesday</span>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">Colors+</h1>
            <p className="max-w-2xl text-sm text-white/70 sm:text-base">
              Hold focus as the chroma wheel swings, nail taps on the matching hue, and stay calm when the signal is a fake.
            </p>
          </div>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center gap-8">
          <div className="relative flex flex-col items-center gap-6">
            <div className="relative flex h-72 w-72 items-center justify-center sm:h-80 sm:w-80">
              <div className="absolute -top-14 flex flex-col items-center text-[0.65rem] uppercase tracking-[0.35em] text-white/60 sm:-top-16">
                <span>Target</span>
                <span className="mt-1 flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.7rem] tracking-[0.2em] text-white">
                  <span
                    className="inline-flex h-3 w-3 rounded-full sm:h-3.5 sm:w-3.5"
                    style={{
                      background: challenge?.targetColor.value ?? "transparent",
                      boxShadow: `0 0 10px ${challenge?.targetColor.glow ?? "rgba(56,189,248,0.4)"}`,
                    }}
                  />
                  <span>{challenge?.fake ? `${challenge?.targetColor.name}?` : challenge?.targetColor.name ?? "—"}</span>
                </span>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-[110%] w-[2px] rounded-full bg-white/30 shadow-[0_0_10px_rgba(255,255,255,0.3)]" aria-hidden />
              </div>
              {status === "playing" ? (
                <button
                  type="button"
                  onPointerDown={handleTap}
                  onClick={(event) => event.preventDefault()}
                  className="relative flex h-full w-full touch-none items-center justify-center rounded-full border border-white/10 bg-slate-950/60 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  <span className="sr-only">Interact with the color wheel</span>
                  <div
                    className="absolute inset-4 rounded-full"
                    style={{
                      background: sliceGradient,
                      transform: `rotate(${rotationRef.current}deg)`
                    }}
                  />
                  <div className="absolute inset-[22%] rounded-full border border-white/10 bg-slate-950/60 shadow-inner shadow-black/60" />
                  {centerContent}
                  <div
                    className="pointer-events-none absolute inset-4 rounded-full"
                    style={{
                      boxShadow: `0 0 40px ${challenge?.targetColor.glow ?? "rgba(56,189,248,0.4)"}`,
                      opacity: 0.75,
                      transition: "opacity 200ms ease, box-shadow 200ms ease",
                    }}
                  />
                </button>
              ) : (
                <div className="relative flex h-full w-full touch-none items-center justify-center rounded-full border border-white/10 bg-slate-950/60 transition">
                  <div
                    className="absolute inset-4 rounded-full"
                    style={{
                      background: sliceGradient,
                      transform: `rotate(${rotationRef.current}deg)`
                    }}
                  />
                  <div className="absolute inset-[22%] rounded-full border border-white/10 bg-slate-950/60 shadow-inner shadow-black/60" />
                  {centerContent}
                  <div
                    className="pointer-events-none absolute inset-4 rounded-full"
                    style={{
                      boxShadow: `0 0 40px ${challenge?.targetColor.glow ?? "rgba(56,189,248,0.4)"}`,
                      opacity: 0.75,
                      transition: "opacity 200ms ease, box-shadow 200ms ease",
                    }}
                  />
                </div>
              )}
              <div className="absolute -bottom-6 flex h-1 w-48 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-full origin-left bg-white/60 transition-transform" style={{ transform: `scaleX(${progress})` }} />
              </div>
            </div>
            <p className="max-w-sm text-center text-sm text-white/70">{statusMessage}</p>
          </div>

          {status === "over" && (
            <div className="flex flex-col items-center gap-5 text-center">
              <div className="flex gap-6 text-sm text-white/70">
                <div className="flex flex-col">
                  <span className="text-xs uppercase tracking-[0.35em] text-white/40">Score</span>
                  <span className="text-lg text-white">{score}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs uppercase tracking-[0.35em] text-white/40">Best Combo</span>
                  <span className="text-lg text-white">×{maxCombo}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs uppercase tracking-[0.35em] text-white/40">Phase</span>
                  <span className="text-lg text-white">{describeDifficulty(intensity)}</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
