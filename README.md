# 22mcq-pbq

A single-file Security+ exam simulator — full-length SY0-701 exam forms, drills, interactive performance-based questions, a read-only post-exam review, and a clearly labelled experimental SY0-801 (V8) preview. No framework, no build step.

Live: [22mcq-pbq-sim-vercel22.vercel.app](https://22mcq-pbq-sim-vercel22.vercel.app)

## What it does

- **Five full-length exam forms (A–E)** — 90 questions, 90 minutes, 450-question bank.
- **24 unique PBQs across the forms** drawn from a 70-scenario pool, with zero cross-form duplication and 5/4/6/5/4 PBQs per form. PBQs are interleaved through the form, not clustered at the front.
- **15 domain exams** — every domain has three disjoint 30-question sets (27 MCQs plus 3 PBQs, 30 minutes each) drawn from a 90-item pool, so a domain can be rehearsed three times without repeats.
- **Nine interactive PBQ families** — firewall ACL configuration, log triage, process sequencing, zone placement, compliance matching, vulnerability prioritisation, cryptography/PKI decisions, terminal forensics and packet-capture analysis.
- **Post-exam review inside the exam shell** — score summary (scaled /900, correct, partial, incorrect, incomplete, flagged), filters, and read-only item views with green/red/dashed-green option states, full explanations, distractor breakdowns and PBQ model solutions. Prev/Next and Back-to-Grid controls work on desktop and mobile.
- **Study mode and drills** with explanations, hints, domain focus, weakest-topic retests and mixed MCQ + PBQ sessions.
- **PBQ Lab** with nine families plus a mixed set, untimed and fully explained.
- **Analytics** — readiness, domain accuracy, weak objectives, activity heatmap, score trend and attempt history.
- **Light / dark / AMOLED themes**, optional Supabase sync, and a resumable exam snapshot.

### Cloud sync setup

1. In your Supabase project open **SQL -> New query**, paste `supabase/schema.sql`, and run it.
2. In the app open **Settings -> Cloud sync**, paste the project URL and the **publishable** key (Project Settings -> API), then press **Connect**.
3. On another device, paste the sync key shown in Settings into "Sync key from another device".

No Supabase sign-in is involved. Never paste a secret or service-role key into the app; it refuses them.

### Experimental: SY0-801 (V8) preview

Security+ V8 (SY0-801) launches on 17 November 2026. The `SY0-801 Preview` nav item opens a section that is visually marked experimental and carries a non-affiliation disclaimer. It contains:

- 64 original MCQs and 4 PBQs written against CompTIA's published V8 objectives (document v2.0), covering all 27 objectives and the new AI objective 2.6.
- A 90-question, 90-minute preview form weighted 16 / 24 / 19 / 27 / 14, filled with native V8 items plus SY0-701 questions remapped to V8 objective numbers.
- A "new in V8" drill (AI, RCS, quishing, deepfakes, negotiation, passkeys, CSPM and more), a mixed drill, and per-objective drills.
- A V7-vs-V8 weight comparison and a summary of what changed.

Scores in this section are practice only and are not a prediction of the live exam.

## Tech stack

Vanilla HTML/CSS/JS in a single `index.html`. Static hosting; optional Supabase project for cross-device attempt sync (`supabase/schema.sql`).

## Running it

```bash
git clone https://github.com/cyr6x/mcq-pbq-sim-vercel.git
cd mcq-pbq-sim-vercel
python3 -m http.server 8000   # then open http://localhost:8000
```

Opening `index.html` directly also works.

## Deploying

`vercel.json` pins a static build (`outputDirectory: "."`, no build command). Any push to `main` deploys as-is.

## Status

Active. See `PROJECT_STATE.md` for architecture invariants, state keys and the verification checklist.

## Tests

Start a local server (`python3 -m http.server 8000`), then:

```bash
node tests/whitebox.js
```

```bash
node tests/examsim.js
```

`tests/cloudsync.js` checks cloud sync end to end; it needs a Postgres with `supabase/schema.sql` applied and `node tests/fakerest.js` running (`npm i pg`).

`whitebox.js` checks engine and layout invariants in headless Chromium; `examsim.js` takes a full 90-item exam through the UI. Both need Playwright with Chromium, and `BASE_URL` overrides the page URL. `tests/` is excluded from the Vercel deploy.
