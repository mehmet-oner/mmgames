const DAYS = [
  {
    id: "monday",
    name: "Monday",
    game: "Neon Drift",
    vibe: "Ease into the week with a zen racer.",
  },
  {
    id: "tuesday",
    name: "Tuesday",
    game: "Echo Shift",
    vibe: "Puzzle loops crafted to sharpen focus.",
  },
  {
    id: "wednesday",
    name: "Wednesday",
    game: "Midweek Mirage",
    vibe: "Rhythm lights in a slow build crescendo.",
  },
  {
    id: "thursday",
    name: "Thursday",
    game: "Flux Grid",
    vibe: "Strategic tiles that rewire with every move.",
  },
  {
    id: "friday",
    name: "Friday",
    game: "Lumen Pulse",
    vibe: "A luminous co-op sprint into the weekend.",
  },
  {
    id: "saturday",
    name: "Saturday",
    game: "Arcade Bloom",
    vibe: "Dynamic playground with experimental modes.",
  },
  {
    id: "sunday",
    name: "Sunday",
    game: "Low Tide",
    vibe: "Slow meditative flows to reset your pace.",
  },
];

const getTodayIndex = () => {
  const today = new Date();
  return (today.getDay() + 6) % 7; // shift so Monday = 0 ... Sunday = 6
};

export default function Home() {
  const todayIndex = getTodayIndex();
  const nextUnlock = DAYS.find((_, index) => index > todayIndex);
  const nextUnlockDay = nextUnlock ?? DAYS[0];
  const nextUnlockLabel = nextUnlock ? nextUnlockDay.name : `Cycle resets · ${nextUnlockDay.name}`;

  return (
    <div className="min-h-screen w-full bg-transparent text-foreground">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-20 px-6 py-16 sm:px-10 lg:px-12">
        <header className="flex flex-col gap-8">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm uppercase tracking-[0.35em] text-muted">MM Games</span>
            <span className="text-xs uppercase tracking-[0.25em] text-muted/80">
              Weekly Arcade
            </span>
          </div>
          <div className="flex flex-col gap-6">
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
              Seven curated game worlds, unlocked one day at a time.
            </h1>
            <p className="max-w-2xl text-base text-muted sm:text-lg">
              Discover a focused experience tailored for the rhythm of each weekday.
              Our minimalist arcade keeps you in the flow: one game per day, with a
              clean space to track progress, mastery, and mood.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted/70 sm:text-sm">
            <div className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-accent" />
              <span className="font-medium text-white/80">
                Next unlock · {nextUnlockDay.game}
              </span>
              <span className="text-muted/60">({nextUnlockLabel})</span>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DAYS.map((day, index) => {
            const isToday = index === todayIndex;
            const isUnlocked = index <= todayIndex;

            return (
              <article
                key={day.id}
                className="group relative overflow-hidden rounded-3xl border border-white/8 bg-white/5 p-6 transition hover:-translate-y-1 hover:border-white/20 hover:bg-white/10"
              >
                <div className="absolute inset-x-6 top-6 z-0 h-32 rounded-3xl bg-gradient-to-br from-white/15 to-white/0 opacity-0 blur-2xl transition group-hover:opacity-100" />
                <header className="relative z-10 mb-8 flex items-center justify-between text-xs uppercase tracking-[0.3em] text-muted/80">
                  <span>{day.name}</span>
                  <span className="font-mono text-[0.65rem] tracking-[0.4em] text-muted/50">
                    {day.id}
                  </span>
                </header>
                <div className="relative z-10 flex flex-col gap-4">
                  <h2 className="text-2xl font-semibold text-white">{day.game}</h2>
                  <p className="text-sm leading-relaxed text-muted/90">{day.vibe}</p>
                  <div className="mt-6 flex items-center justify-between text-xs text-muted/70">
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-flex h-2 w-2 rounded-full ${isUnlocked ? "bg-accent/80" : "bg-muted/40"}`}
                      />
                      {isToday
                        ? "Live today"
                        : isUnlocked
                        ? "Available to revisit"
                        : "Unlocks soon"}
                    </span>
                    <button
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 font-medium transition ${
                        isUnlocked
                          ? "border-white/10 text-white/80 hover:border-white/40 hover:text-white"
                          : "border-white/5 text-muted/40"
                      }`}
                      disabled={!isUnlocked}
                    >
                      {isUnlocked ? (isToday ? "Launch" : "Replay") : "Locked"}
                      <span aria-hidden className="text-white/60">
                        →
                      </span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
