# Project State

## Objective
SY0-701 Security+ exam simulator: five full-length exam forms, drills, interactive PBQ practice, post-exam review and analytics, plus a clearly labelled **experimental SY0-801 (V8) preview section**. Deployed as a single static page.

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
- Question bank: `SEED_V1` (15) + `BULK_MCQS` (255) + `DOMAIN_EXPANSION_MCQ` (180) = **450 MCQs**, exactly **90 per domain**; `PBQ_SEEDS` = **70 PBQs across 9 families** (30 original + 40 in `DOMAIN_EXPANSION_PBQ`, pushed onto the array at load; at least 9 PBQs per domain) (`pbq-firewall`, `pbq-log`, `pbq-sequence`, `pbq-placement`, `pbq-compliance`, `pbq-vulnscan`, `pbq-crypto`, `pbq-terminal`, `pbq-packet`).
- Exam forms: `EXAM_VARIANTS` = A–E with deterministic seeds. `EXAM_PBQ_DISTRIBUTION = [5,4,6,5,4]` (24 PBQs allocated). `partitionPBQsByForm(pool, 5)` returns five disjoint PBQ slices (zero cross-form overlap, type variety maximised per form); cached by `pbqForms()`.
- Form order: `buildStrictExamOrder(pbqs, mcqs, variantId)` interleaves PBQs into the 90 items using seeded per-PBQ segments (one PBQ per segment, never at index 0 or 89), so PBQs are scattered rather than clustered. Exam = 90 items / 5400 s.
- Review: post-exam review runs **inside `#exam-screen`**. `showReview(filter)` sets `S.reviewMode`, `#exam-screen[data-review-mode="true"]` and `data-ephase="review"`; `renderExamReview(f)` paints the grid from `#exam-review-phase`; `openReviewItem(i)` sets `data-ephase="item"` and renders the read-only item with `renderReviewChrome()`.
- Attempt data: `attempts` records `{mode,variant,label,at,score,correct,total,dur,items[],key}`, stored in `sy0701_attempts_v2` (capped 200). `sy0701_stats` is derived per question and is rebuilt from attempts after cloud merge.
- Snapshot/resume: `sy0701_exam_snapshot` autosaves every 5 s; resume restores questions, index, answers, flags, timer, variant and clears review chrome.
- Preferences: `appPrefs` (`amber`, `red`, `focusNotice`, `autoAdvance`), `sy0701_panels`, theme in `appTheme`.
- Icons: inline SVG sprite (`<symbol id="i-*">`) at top of `<body>`; `.ico` class inherits stroke.
- Cloud sync: settings panel → dynamic `import()` of `@supabase/supabase-js` only when configured; local data is never deleted by connecting; uploads are idempotent via `client_key`; RLS scopes rows to `auth.uid()`.

## SY0-801 Experimental Preview (added 2026-11)
- **Status: experimental, unofficial, not affiliated with CompTIA.** Content is authored from CompTIA's published SY0-801 V8 exam objectives (document version 2.0, linked from `comptia.org/en-us/certifications/security/v8/`). No dump content, no reconstructed live items.
- Exam facts reflected in the UI: launch 17 Nov 2026; up to 90 questions in 90 minutes; 750/900; English only; SY0-701 English retires 11 Jun 2027; 27 objectives across 5 domains with weights **16 / 24 / 19 / 27 / 14**.
- Data block (inserted right after `SEED_QUESTIONS`): `SY801_DOMAINS`, `SY801_WEIGHTS`, `SY801_CHANGES`, `SY801_OBJECTIVES` (27 entries), `SY801_MCQS` (**64** native items, 3 multi-select, ids `e001`–`e064`, `exam:'801'`; 18 carry `tag:'new'`), `SY801_PBQS` (**4** native PBQs reusing existing engines: `sy801-p1` AI threat placement 2.6, `sy801-p2` IR sequence incl. negotiation 4.7, `sy801-p3` threat-vector compliance 2.3, `sy801-p4` control-type placement 1.1), `SY801_META`.
- Track flag: `S.examTrack` (`'701'` default / `'801'`) and `S.sy801Tag`; both are written to and restored from `sy0701_exam_snapshot`. Attempt records now carry `track`.
- Assembly: `buildExamQuestions()` branches to `buildSY801Questions()` when `S.examTrack==='801'`. Full preview = 4 native PBQs + `pbq002`/`pbq007` (the two genre-crossing V7 PBQs carried forward) + 84 MCQs allocated by V8 domain weight, filled from native 801 items first and then from **carried-forward V7 items remapped through `V7_TO_V8`** (e.g. V7 4.8 IR → V8 4.7; V7 2.5 mitigations → V8 4.1). V7 numbering is dropped (`carried:true`, `v7obj` kept, `reference` rewritten).
- UI: `#/sy801` screen (`renderSY801`) with an experimental banner + non-affiliation disclaimer, exam-fact strip, V7-vs-V8 weight bars, "what changed in V8" list, per-objective coverage rows with a drill button each, and provenance/limits. Nav entry `SY0-801 Preview` with an `Exp` badge; dashboard and exam-set cards link to it. During an 801 session `#exam-screen[data-track="801"]` shows a persistent `.track-note` band and the mode chip reads `SY0-801 · Experimental`; results subtitle reads `SY0-801 (V8) Experimental Preview`.
- Domain labels in the item header, results breakdown and weak-objective callout route through `domLabel(d)`, which switches to `SY801_DOMAINS` on the 801 track.
- `_qIndex()` and `retestIds()` are track-aware, so retesting an 801 item (or `sy801-*` PBQ) reopens on the 801 track; `newExamFromReview()` cycles the 801 seed (variants 1–3) instead of the 701 variant list.

## Per-Domain Exams (added 2026-11)
- Every domain runs **three disjoint 30-question exams** (`Domain N · Exam 1/2/3`): 27 MCQs + 3 PBQs, 30-minute timer, no explanations until review.
- Pooling: `_domainExamPools()` groups each domain's 90 MCQs by sub-objective, gives each objective a proportional quota for the 81 slots that will be used (27 x 3), trims the remainder from the largest objectives, and deals the result round-robin across the three exams. Objective order rotates each rank so the modulo-3 deal cannot send the same objectives to the same exam every cycle. PBQs are grouped by engine type and dealt the same way, so each exam gets a mix of families. All three exams in a domain use **90 distinct MCQs and 9 distinct PBQs**; pools are cached for the page lifetime, so ordering is stable across launches and re-renders.
- Launch path: `launchDomainExam(d,k)` builds an explicit id list (`domainExamIds`) with the three PBQs spliced in at positions 8, 17 and 26, then calls `launchSession({mode:'exam',timeLimit:1800,explain:false,label:'Domain N · Exam k',launchOpts:{explicitIds}})`. The exam branch of `buildExamQuestions` now honours `launchOpts.explicitIds` (fixed-id exam sets) before falling back to `EXAM_VARIANTS`, so domain sets get exam-mode scoring, pass/fail, post-exam review and the scaled score, while still drawing an exact pre-computed list. Because a label is supplied, `_syncTrackChrome()` shows the set name in the top bar.
- Dashboard/analytics "full-length" counts now require `mode==='exam' && total===90`, so a 30-item domain set is not counted as a full-length sitting.
- UI: `renderSets()` renders one section per domain plus three cards each (15 cards total) via `domainExamSections()`; the dashboard has a `Domain exams` quick card. Card copy states 27 MCQs / 3 PBQs / 30 min.
- The old single "Domain 1-5 · 30 questions" drill cards were removed from `EXAM_SETS`; the study-mode domain filter still exists for free-form drills.
- Content provenance: the 180 new MCQs and 40 new PBQs were written for this page against the published SY0-701 objective list (no dump content). New items use ids `dx001`-`dx180` and `pbq031`-`pbq070`; every item carries `obj` and a `reference` of the form `Objective X.Y - <topic>`.

## Realism + Cloud Sync Pass (2026-11-25, exam-prep focus: SY0-701 only)
- **MCQs**: 199 short recall stems in `BULK_MCQS` (r000-r254) rewritten as original 2-3 sentence scenarios; the bank's median stem is now scenario length (tests assert >= 22 words and none under 12). Keys fixed: r041 (sandbox detonation is Analysis, not Containment), r124 (memory-leak reboot loop is Resource exhaustion, not Race condition), r094 (trade secret -> Restricted), r118 (COPE stem made unambiguous), r010/r114 options rebuilt. 19 multi-selects had throwaway distractors ("Cafeteria menus", "Cable management", "Gut feeling", "holiday"); all replaced with plausible ones (plus dx027). A Form A read-through fixed four more: s008 made vendor-neutral (was AWS accounts/SCP/CMK), "Record-level" -> field-level encryption, an SSO-integration gap no longer keyed as Federation, "Secure enclave / TPM" -> "Secure enclave".
- **PBQs**: `rightSizePBQ()` runs over `PBQ_SEEDS` at load and caps each PBQ at `PBQ_MAX_DECISIONS = 6` scored decisions. Placement/compliance keep round-robin coverage of zones/frameworks; sequence keeps evenly spaced steps and renumbers `correctPosition`; vulnscan keeps the 3-item priority queue plus 3 remediations; firewall locks extra rules at their correct action. Counts stated in scenarios follow the trim ("twelve requirements" -> "six"). `pbqDecisions(q)` and `q._trimmedFrom` support the tests. Before: 30 PBQs at 7-12 decisions; after: all 4-6.
- **Scope**: `PBQ_OUT_OF_SCOPE` marks pbq058 (audit evidence methods) as beyond objective 5.5. Exams draw from `PBQ_EXAM_POOL` (69 PBQs); the Lab still shows pbq058 with a "Beyond SY0-701 scope" tag. Borderline but kept: pbq066 (ITIL change types), pbq040 ("community" cloud).
- **PBQ placement**: `PREFS.pbqFirst` (default true; Settings -> "PBQ placement in exams"). Full forms and domain exams put PBQs first when on, else the previous seeded interleave. Basis: candidate reports; CompTIA does not publish item order.
- **Cloud sync rebuilt** (`supabase/schema.sql`; `cloudRpc`/`cloudSync`/`cloudConnect` in `index.html`). No Supabase Auth and no client library. The app generates a 256-bit sync key (`sk_` + 43 base64url chars). Table `public.sim_attempts` is keyed by `sha256(sync key)`, RLS on, all table privileges revoked from anon/authenticated. The browser calls only `sim_push(p_key, p_rows)` (idempotent, <= 200 rows, constraint-checked), `sim_pull(p_key)` (latest 500) and `sim_forget(p_key)` through `/rest/v1/rpc/*` with the publishable key in `apikey` (legacy JWT anon keys also sent as Bearer). Auto-sync on load, after every attempt and on `online`; offline attempts stay local. Secret keys and non-supabase.co URLs are refused; the project is verified before config is saved. Settings shows the sync key (copy to another device), Sync now, Turn off on this device, Delete cloud copy. The old `attempts` table / anonymous sign-in design is retired.
- **Owner step**: run `supabase/schema.sql` in the target project's SQL editor, then paste URL + publishable key in Settings. The project is in another Supabase account and no credentials were shared, so the live project was not touched.
- **Tests**: `tests/whitebox.js` 149/149 (adds PBQ placement in both modes, decision cap, out-of-scope exclusion, stem length, distractor and count checks); `tests/examsim.js` 123/123 (PBQs now lead Form A); new `tests/cloudsync.js` 23/23 with `tests/fakerest.js` (two browser profiles syncing through the real schema on Postgres 16 as role `anon`; wrong key, secret key, bad URL, offline, isolation between keys, delete). SQL also exercised directly: 13 positive/negative checks (no direct table access, invalid key, check constraints, idempotent retry, non-array payload, helper not callable, only hashes stored); re-running the schema is idempotent.

## Polish + Bug-Fix Pass (2026-11-25)
- **Premium layer**: one token-driven CSS block appended at the end of the stylesheet (`PREMIUM LAYER`), with per-theme values for slate, light and AMOLED (`--accent-2`, `--grad-accent`, `--hairline`, `--highlight`, `--glass`, `--card-grad`, `--lift`, `--ring-track`). Glass sidebar, exam top bar and navigator drawer; gradient accents on the brand mark, primary buttons, eyebrow dots and Full Exam cards; tinted icon tiles and lift on quick cards; selected answers get an accent ring and a filled letter; amber/red timer pill states; modal and pause blur with entrance motion. `prefers-reduced-motion` disables the new motion.
- **Exam progress rail**: `#x-progress-fill` under the exam top bar tracks answered / total from `updateNavigator()`; hidden in review.
- **Results hero**: `setResultRing(p, passed, ofText, markDeg, kicker)` drives a conic `.score-ring` (animated through the registered `--p` property) with a tick at the pass mark (750 for exams, 70% for study). `#results-screen[data-outcome]` tints the hero glow.
- **Bugs fixed**:
  1. Mid-exam Item Review grid showed Correct / Incorrect / % per item while the exam was live (answer-key leak). It now shows only Answered / Incomplete until submission.
  2. Results tiles counted skipped items as both Incorrect and Skipped. Incorrect now excludes skipped, so Correct + Partial + Incorrect + Skipped = total (same rule as `reviewMetrics()`).
  3. Results page was a column flexbox with `justify-content:center` and overflow, which clipped the top of the score card and left-aligned the content. It is now a centred block layout.
  4. "Retake Exam" went to the dashboard; it now relaunches the same config (`retakeExam()` from `S.lastCfg`, which is also saved in the snapshot). "Home" opened the unrouted legacy welcome screen; it is now "Dashboard" (`backToDashboardFromReview()`).
  5. Untimed study sessions (`timeRemaining 0`) painted every navigator chip as "time running out" and turned the timer red.
  6. Keyboard `P` could pause but not resume (the handler returned early while paused). Keys are also ignored while a modal is open (Escape still closes it), and `P` does not resume behind the in-exam settings layer.
  7. Hint button promised a "-10% score penalty" that was never applied, and the hint vanished on the next re-render. Copy is now "rules out one wrong option"; the eliminated option is stored in `S.hintPick` and re-shown.
  8. Snapshot `elapsedMs` included paused time, so a resumed exam billed pauses as working time.
  9. Analytics pass rate and attempt colours used raw >= 75 while the engine passes at raw >= 70 (750 scaled), so a 72-74% run read PASS on results and FAIL in analytics. All thresholds now follow `calcScaledScore()`; dashboard copy states the 70% raw / 750 rule.
  10. Dashboard "Weakest domains" rows were nested inside a 3-column grid, squeezing each row into the 76 px label column (and overflowing by 71 px on phones).
  11. Log-triage PBQ selects had inline `min-width:360px`, overflowing 390 px phones by 12 px.
  12. Study summary tiles now show Correct / Partial / Incorrect / Skipped, the second card is titled "Objectives to Revisit", and the "Open study mode" button exits review first.
  13. Dashboard stat captions corrected: "Questions · served across all sessions" (it counts skipped items) and "Mastered · seen 2+ times, right last time".
- **Tests committed** in `tests/` (excluded from Vercel by `.vercelignore`). Run with a local server: `python3 -m http.server 8000`, then `node tests/whitebox.js` (142 assertions) and `node tests/examsim.js [screenshot-dir]` (123 assertions, full 90-item Form A driven through the UI). `BASE_URL` overrides the page URL. Requires Playwright + Chromium.

## Current Feature / Task
Per-domain exam sets shipped on top of an expanded 450-MCQ / 70-PBQ bank. Next up is the remaining 701 rework: PBQ scope retagging to official objectives, the pairwise-overlap variation engine for full forms, objective mini-sections, cheatsheet `pbq-match` PBQs and liquid-glass chrome.

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
- 2026-11-25, real headless Chromium (Playwright): `tests/whitebox.js` 142/142 — bank integrity (450 MCQs, 70 PBQs, 90 per domain, key counts, no duplicate ids/stems/options), all 74 PBQs (incl. 801) score 1.0 with the oracle and 0 blank and render live + review, all 514 MCQs render/grade, five forms (90 unique, 5/4/6/5/4 PBQs, first/last MCQ, domain weights within ±2, no cross-form PBQ), all-correct = 900 PASS, blank tiles sum to 90, live review hides grading, 15 domain exams (30 items, 3 PBQs, 1800 s, disjoint), three 801 forms, study mode, keyboard, reload + resume, retake/dashboard actions, pass-threshold consistency, XSS escaping, no horizontal overflow at 1440 and 390 px. `tests/examsim.js` 123/123 — Form A taken end to end through the UI (clicks, multi-select cap, PBQ selects, flags, pause/resume by button and key, mid-exam review, end-exam modal, results vs independent recomputation, attempt record, 90-item read-only review walk, filters, dashboard/analytics). Zero console errors besides blocked CDN fetches in the sandbox.
- Both inline script blocks parse (`node --check`).
- SY0-801 preview: 78-assertion jsdom suite (`/tmp/t2/test801.js`) — bank integrity, 27-objective map, routing, 90-item assembly with 6 PBQs and V8 domain mix, timer 5400, track chrome, snapshot round-trip, results labelling, tag/domain/mixed drills, all 4 native PBQs rendered and graded (incl. partial credit), cross-track retest, 701 regression, zero console errors. 41-assertion regression suite (`/tmp/t2/test701.js`) — all routes, all 30 PBQs and 270 MCQs render and grade, 5 exam variants, snapshot and timer paths, 801 entry points on dashboard/sets.
- jsdom whitebox suites: 41 assertions on domain exams (`/tmp/t4/test_domains.js`) — bank totals (450/70), 90 MCQs per domain, answer-key parity, no duplicate stems, 15 exam sets of exactly 30 items with 3 interleaved PBQs, disjointness across the three exams in each domain, every set launched and rendered, timer 1800, full-credit scoring, all 40 new PBQs rendered and scored, five full forms and the 801 preview still intact.
- 47-assertion full regression suite (`/tmp/t4/test_regress.js`) — every one of the 450 MCQs and 70 PBQs rendered and graded, all routes, sets-screen clicks (Full Exam A, Domain 3 · Exam 2), snapshot round-trip, results labelling, 801 track and drills, PBQ lab.
- Earlier 156-assertion suite covered boot, `selectCount` parity, `whyWrong` keys, partitioning, post-exam review filters/navigation/model solutions, multi-select cap/read-only, XSS escaping, routes/themes and a randomized fuzz submit/review pass; those invariants are unchanged by this feature.
- Cloud sync fallback/validation paths exercised locally; live Supabase project not available in this environment.

## Known Issues
- Cloud sync is verified against the real schema on Postgres 16 through a PostgREST stand-in, not against a hosted Supabase project (no network or credentials here). The first live connect is the remaining check.
- A sync key is a bearer secret by design: whoever holds it can read and append that history.
- Bulk MCQ stems were rewritten in one pass and keys reviewed by one reviewer; the 180 dx items and 15 seed items were only spot-checked via a Form A read-through.
- Real-browser E2E now runs in headless Chromium (see `tests/`); there is still no Safari/Firefox or physical-device pass.
- Firewall PBQ defaults are seeded at submit (by design), so an unvisited firewall item counts as answered and can earn partial credit.
- Domain-exam content: the 180 new MCQs and 40 new PBQs are original but written quickly against the objective list; they are not peer-reviewed for exam realism. The three exams per domain are disjoint by construction, but the pool is fixed, so a fourth sitting repeats content.
- SY0-801 content is an approximation of an exam that had not yet launched at build time: objective mapping is per the published PDF, but question style, difficulty mix and PBQ formats are our own. Native 801 coverage is uneven (64 items over 27 objectives, from 1 to 5 per objective); the full preview fills the gap with carried-forward V7 items, so an 801 form mixes both flavours. Since 64 < 84 MCQ slots, **every preview form contains the entire native MCQ bank plus 20 carried items** (measured variants 1-3: 64 native / 20 carried, 71-72 of 90 items shared between forms). Repeated 801 forms therefore repeat most content until the native bank grows past ~84 items. Carried items keep V7 wording and may reference V7-only detail not explicitly listed in V8.

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
