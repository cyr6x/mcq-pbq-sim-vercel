# Project State

## Objective
SY0-701 Security+ exam simulator: five full-length exam forms, drills, interactive PBQ practice, post-exam review and analytics. Deployed as a single static page.

## Stack
- frontend: vanilla HTML/CSS/JS, one file (`index.html`), no build step
- backend: none (static hosting); optional Supabase for cross-device sync
- database: browser localStorage (authoritative); Supabase `public.attempts` (optional mirror)
- auth: none locally; Supabase anonymous sign-in when cloud sync is configured
- deployment: Vercel static (`vercel.json`, outputDirectory `.`)
- repo: `cyr6x/mcq-pbq-sim-vercel`

## Architecture Facts
- Single `<script>` block holds the engine + shell. `const S` is a lexical global (not on `window`); tests must use `window.eval`.
- Screen system: `.screen.active`. Hash router `route()` reads `location.hash`; `ROUTES` maps hashes to screens. The exam screen is a full-screen flow protected from routing while live (`isExamLive()`).
- Question bank: `SEED_V1` (15) + `BULK_MCQS` (255) = **270 MCQs**; `PBQ_SEEDS` = **30 PBQs across 9 families** (`pbq-firewall`, `pbq-log`, `pbq-sequence`, `pbq-placement`, `pbq-compliance`, `pbq-vulnscan`, `pbq-crypto`, `pbq-terminal`, `pbq-packet`).
- Exam forms: `EXAM_VARIANTS` = A–E with deterministic seeds. `EXAM_PBQ_DISTRIBUTION = [5,4,6,5,4]` (24 PBQs allocated). `partitionPBQsByForm(pool, 5)` returns five disjoint PBQ slices (zero cross-form overlap, type variety maximised per form); cached by `pbqForms()`.
- Form order: `buildStrictExamOrder(pbqs, mcqs, variantId)` interleaves PBQs into the 90 items using seeded per-PBQ segments (one PBQ per segment, never at index 0 or 89), so PBQs are scattered rather than clustered. Exam = 90 items / 5400 s.
- Review: post-exam review runs **inside `#exam-screen`**. `showReview(filter)` sets `S.reviewMode`, `#exam-screen[data-review-mode="true"]` and `data-ephase="review"`; `renderExamReview(f)` paints the grid from `#exam-review-phase`; `openReviewItem(i)` sets `data-ephase="item"` and renders the read-only item with `renderReviewChrome()`.
- Attempt data: `attempts` records `{mode,variant,label,at,score,correct,total,dur,items[],key}`, stored in `sy0701_attempts_v2` (capped 200). `sy0701_stats` is derived per question and is rebuilt from attempts after cloud merge.
- Snapshot/resume: `sy0701_exam_snapshot` autosaves every 5 s; resume restores questions, index, answers, flags, timer, variant and clears review chrome.
- Preferences: `appPrefs` (`amber`, `red`, `focusNotice`, `autoAdvance`), `sy0701_panels`, theme in `appTheme`.
- Icons: inline SVG sprite (`<symbol id="i-*">`) at top of `<body>`; `.ico` class inherits stroke.
- Cloud sync: settings panel → dynamic `import()` of `@supabase/supabase-js` only when configured; local data is never deleted by connecting; uploads are idempotent via `client_key`; RLS scopes rows to `auth.uid()`.

## Current Feature / Task
Exam-form partitioning, interactive PBQ coverage, in-exam post-exam review, content audit and mobile polish.

## Implemented
- Five full-length forms (A–E) with 5/4/6/5/4 PBQs and zero cross-form duplication; each form carries distinct PBQ types.
- PBQs interleaved through all 90 items via seeded segments; first and last slots are always MCQ.
- 9 PBQ engines: firewall ACL, log triage, sequence ordering, zone placement, compliance matching, vulnerability triage, crypto decision tree, terminal forensics, packet analysis. Optional `evidence` exhibits (`log`, `terminal`, `packet`, `table`) render above any PBQ interaction.
- Post-exam review in `#exam-screen`: score summary (scaled `XXX / 900`, Correct, Partial, Incorrect, Incomplete, Flagged), filters (All, Incorrect & Incomplete, Flagged, PBQs, Correct), grid → item navigation, read-only options with green/red/dashed-green states, full explanation + remapped `whyWrong` breakdown, PBQ model solutions, sticky `.xfoot` Prev/Next/Back-to-grid bar (fixed on <760 px), and Back to Dashboard / Score Summary / New Exam controls.
- Review mode hides timer and pause, shows a score pill in the top bar, routes the “Grid” button back to the review grid, and never triggers the Leave Exam modal.
- Multi-select fixes: `r130` restored as a valid select-three, 50 multi-select items audited to `selectCount == correct count`, cap enforcement, in-place re-render (no scroll jump), read-only in review.
- Markdown-bold stems (`**SELECT TWO.**`) rendered through an escape-then-format `fmt()` helper; no raw asterisks remain.
- `whyWrong` keys are remapped to post-shuffle option letters in `buildExamQuestions()`.
- Firewall defaults are seeded on first interaction and at submit, so untouched-but-valid rules grade correctly.
- Sequence PBQ uses 0-based `correctPosition`, a real invalid-zone model (`{order, invalidId}`), and ↑/↓/Not-a-step buttons instead of drag-only.
- Mobile tap fallbacks: zone selects on placement, per-row priority selects on vulnerability triage, remediation select on log triage.
- PBQ Lab: 9 families plus Mixed PBQ Lab; `launchPbqFamily()` is type-based and cannot throw.
- Auto-advance is an explicit setting (default **off**); MCQ/PBQ interactions preserve scroll.
- Results and history accuracy use the same full-credit rule (`score >= 0.999`); partial PBQ credit is a separate metric.

## Verified
- Both inline script blocks parse (`node --check`).
- jsdom whitebox suites: 156 assertions covering boot, content audit (option correctness, `selectCount` parity, `whyWrong` keys), partitioning, per-form assembly, perfect/empty scoring, all 30 PBQs live + review rendering, all 270 MCQs live + review rendering, multi-select cap/read-only, post-exam review filters/navigation/model solutions, PBQ lab launches, sequence + firewall scoring, XSS escaping, routes/themes, and a randomized fuzz submit/review pass on every form.
- Cloud sync fallback/validation paths exercised locally; live Supabase project not available in this environment.

## Known Issues
- Cloud sync against a real Supabase project is unverified (no credentials). SQL file reviewed by inspection only.
- Bulk MCQ text is inherited from the original bank; audited for answer-count correctness and domain mapping, not professionally reviewed for clinical phrasing.
- No real-browser E2E in the sandbox (browser binaries unavailable); layout is verified by CSS inspection plus jsdom DOM assertions.

## Security Notes
- Only the Supabase anon key is entered in the browser (by design). Never add a service-role key.
- RLS is required; without it rows would be readable by other anon sessions.
- Answer data and attempts are stored unencrypted in localStorage (single-user device assumption).
- `esc()` is applied before every interpolation; `fmt()` escapes first, then converts `**bold**` and newlines only.
- Imported attempt data from Supabase is treated as display-only.

## Do Not Change
- Question object shapes (`mcq-single`, `mcq-multi` with `selectCount`, `pbq-*`) and the `computeScore` contract (PBQ score 0…1, partial credit preserved).
- `S` field names used by snapshot/restore and `recordAttempt`.
- Exam flow guards (`isExamLive`, `route()` exam lock, beforeunload) and the review guards (`S.reviewMode`, `S.reviewPhase`).
- Static deploy config (`vercel.json`, no build).

## Important Files
- `index.html`: entire app (markup, CSS, engine, shell).
- `supabase/schema.sql`: attempts table + RLS.
- `vercel.json`: static no-build configuration.

## Decisions
- Local-first analytics; cloud is an optional mirror → works offline, no mandatory backend.
- Seeded partitions/orders instead of random per launch → repeatable, auditable exam forms.
- PBQs interleaved (not front-loaded) → matches current CompTIA delivery where performance items appear throughout the form.
- Post-exam review reuses the exam shell instead of a separate page → one navigator, one item renderer, no duplicated review code.
- Inline SVG icons instead of an icon dependency → single-file deploy stays intact.

## Next Actions
1. Verify cloud sync against a real Supabase project (create project, run schema, enable anonymous auth).
2. Optional content QA: expand `whyWrong` coverage beyond the current subset.
3. Optional: add per-form analytics that compare Form A–E attempts side by side.
