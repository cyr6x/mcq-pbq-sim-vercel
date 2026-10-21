# Project State

## Objective
SY0-701 Security+ exam simulator: full-length exams, drills, PBQ practice, review queue and analytics. Deployed as a single static page.

## Stack
- frontend: vanilla HTML/CSS/JS, one file (`index.html`), no build step
- backend: none (static hosting); optional Supabase for cross-device sync
- database: browser localStorage (authoritative); Supabase `public.attempts` (optional mirror)
- auth: none locally; Supabase anonymous sign-in when cloud sync is configured
- deployment: Vercel static (`vercel.json`, outputDirectory `.`)
- repo: `cyr6x/mcq-pbq-sim-vercel`, branch `sy0-701-base` → pushes to `main`

## Architecture Facts
- Single `<script>` block holds the engine + shell. `const S` is a lexical global (not on `window`); tests must use `window.eval`.
- Screen system: `.screen.active`. Hash router `route()` reads `location.hash`; `ROUTES` maps hashes to screens. Exam is a separate full-screen flow, protected from routing while live.
- Question bank: `SEED_V1` (15) + `BULK_MCQS` (255 ported from the original React bank) = 270 MCQs; `PBQ_SEEDS` (7 scenario types). `EXAM_VARIANTS` (A–D) use seeded shuffles; exam form = 7 PBQs first + 83 MCQs = 90 questions / 5400 s.
- Attempt data: `attempts` records `{mode,variant,label,at,score,correct,total,dur,items[],key}`, stored in `sy0701_attempts_v2` (capped 200). `sy0701_stats` is derived per question and is rebuilt from attempts after cloud merge.
- Snapshot/resume: `sy0701_exam_snapshot` autosaves every 5 s; resume restores questions, index, answers, flags, timer, variant.
- Preferences: `appPrefs` (amber/red timer thresholds, focus notice), `sy0701_panels`, theme in `appTheme`.
- Icons: inline SVG sprite (`<symbol id="i-*">`) at top of `<body>`; `.ico` class inherits stroke.
- Cloud sync: settings panel → dynamic `import()` of `@supabase/supabase-js` only when configured; local data is never deleted by connecting; uploads are idempotent via `client_key`; RLS scopes rows to `auth.uid()`.

## Current Feature / Task
UI polish + more exam forms + optional Supabase analytics.

## Implemented
- Modern type (Inter + JetBrains Mono), refined dark/light/AMOLED tokens, SVG icon system replacing letter/emoji chrome.
- Icon-only exam top bar (pause/play swap, fullscreen, settings, home), timer pill, cleaner item header and edge arrows; responsive/mobile rules; reduced-motion support.
- Exam/results/review/welcome screens hide the app nav and burger (`body[data-nav="hidden"]`); top bar and content share a 1000 px column.
- Exam sets page: grouped form/drill/domain cards with name, count and a single meta line; full forms labelled A–D.
- Four full-length exam forms A–D (seeded, unique within form), 5 timed drills, 5 domain sets; PBQs now first in full exams (matches real exam layout).
- Dashboard/study/lab/review copy rewritten to factual, non-motivational text; neutral empty states.
- Analytics: activity heatmap (12 weeks), score trend (15 sessions), domain accuracy, pass rate, time on task; attempt rows show form label and timestamp.
- Supabase cloud sync (optional): connect/sync/disconnect, status indicator, schema in `supabase/schema.sql`, JSON export.
- Exam attempt recording now stores variant/label/key.
- Review phase: 3-column grid from 960 px, compact rows, PBQ tag, sticky footer; pause card centered with play-icon resume.
- MCQ options are re-lettered A–D after shuffling (seeded or random), so displayed letters stay sequential; grading follows option ids.
- All decorative emoji removed from chrome and PBQs (controls, crypto nodes, flag, timer warning) in favour of sprite icons.

## Verified
- Both inline script blocks parse (`new Function`).
- jsdom e2e suite: navigation, exam launch (90 unique, PBQ first), keyboard, review phase, pause/snapshot/resume, submit, attempt persistence. (Re-run after each change.)
- Cloud sync fallback/validation paths exercised locally; live Supabase project not available in this environment.

## Known Issues
- Cloud sync against a real Supabase project is unverified (no credentials). SQL file reviewed by inspection only.
- Bulk MCQ text is inherited from the original bank; spot-checked but not professionally reviewed.

## Security Notes
- Only the Supabase anon key is entered in the browser (by design). Never add a service-role key.
- RLS is required; without it rows would be readable by other anon sessions.
- Answer data and attempts are stored unencrypted in localStorage (single-user device assumption).
- `esc()` used for user-visible interpolated strings; imported attempt data from Supabase is treated as display-only.

## Do Not Change
- Question object shapes (`mcq-single`, `mcq-multi` with `selectCount`, `pbq-*`) and `computeScore` contract.
- `S` field names used by snapshot/restore and `recordAttempt`.
- Exam flow guards (`isExamLive`, `route()` exam lock, beforeunload).
- Static deploy config (`vercel.json`, no build).

## Important Files
- `index.html`: entire app (markup, CSS, engine, shell).
- `supabase/schema.sql`: attempts table + RLS.
- `vercel.json`: static no-build configuration.

## Decisions
- Local-first analytics; cloud is an optional mirror → works offline, no mandatory backend.
- Seeded variants instead of random each launch → distinct, repeatable exam forms.
- PBQs first → mirrors CompTIA delivery; review/navigation unchanged.
- Inline SVG icons instead of an icon dependency → single-file deploy stays intact.

## Next Actions
1. Verify cloud sync against a real Supabase project (create project, run schema, enable anonymous auth).
2. Content QA pass on bulk MCQs (accuracy vs SY0-701 objectives).
3. Optional: retire `fmtClock` hour formatting on the resume banner if a 90-minute clock display is preferred (exam timer shows `MM:SS`).
