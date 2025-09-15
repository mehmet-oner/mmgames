# Repository Guidelines

## Project Structure & Module Organization
- Core Next.js routes and UI live in `app/`. `app/page.tsx` renders the weekly arcade hub, while nested segments such as `app/games/monday` hold day-specific screens and helper components.
- Global styling and Tailwind theme tokens are centralized in `app/globals.css`; extend the declared CSS variables before scattering new colors.
- Static assets (SVGs, icons) reside in `public/`. Keep exports optimized and prefer re-using existing motifs.
- Runtime configuration stays in the root (`next.config.ts`, `tsconfig.json`, `eslint.config.mjs`). Treat `node_modules/` as read-only.

## Build, Test, and Development Commands
- `npm run dev` launches the local dev server with Turbopack at http://localhost:3000, hot-reloading React Server Components.
- `npm run build` produces a production bundle and surfaces type-check and lint failures; run before handing off a feature.
- `npm run start` serves the production build; use it to validate behavior under optimized output.
- `npm run lint` enforces the Next.js core-web-vitals ruleset; fixes should pass cleanly before review.

## Coding Style & Naming Conventions
- Write TypeScript React components using 2-space indentation and double quotes, matching existing files.
- Route folders and file basenames stay in kebab-case; exported components and hooks use PascalCase/CamelCase respectively.
- Prefer Tailwind utility classes for layout and state visuals; cluster related utilities (layout → color → motion) to remain readable.
- Client-side interactivity belongs in files marked with `'use client'`; default to server components otherwise.

## Testing Guidelines
- Automated tests are not yet configured. When adding coverage, place component specs alongside the feature (`app/**/__tests__`) with React Testing Library, and document manual QA steps in the PR until tooling ships.
- Smoke-test new games in Chromium and Safari technology preview to check animation timing and keyboard accessibility.

## Commit & Pull Request Guidelines
- Follow the existing short, imperative commit style (e.g., `snake added`, `slowed down`). Group related changes per commit.
- Pull requests must include: concise summary, linked issue or task, before/after media for UI shifts, manual test notes, and callouts for follow-up work.

## Environment & Deployment Notes
- Secrets belong in `.env.local`; never commit environment files. Reference with `process.env` guards.
- When adding assets, confirm they load after `npm run build && npm run start` to avoid missing file regressions.
