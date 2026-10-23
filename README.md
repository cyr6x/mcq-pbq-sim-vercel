# 22mcq-pbq

A single-file Security+ (SY0-701) exam simulator — full-length exam forms, drills, interactive performance-based questions, and a read-only post-exam review. No framework, no build step.

Live: [22mcq-pbq-sim-vercel22.vercel.app](https://22mcq-pbq-sim-vercel22.vercel.app)

## What it does

- **Five full-length exam forms (A–E)** — 90 questions, 90 minutes, 270-question bank.
- **24 unique PBQs across the forms** drawn from a 30-scenario pool, with zero cross-form duplication and 5/4/6/5/4 PBQs per form. PBQs are interleaved through the form, not clustered at the front.
- **Nine interactive PBQ families** — firewall ACL configuration, log triage, process sequencing, zone placement, compliance matching, vulnerability prioritisation, cryptography/PKI decisions, terminal forensics and packet-capture analysis.
- **Post-exam review inside the exam shell** — score summary (scaled /900, correct, partial, incorrect, incomplete, flagged), filters, and read-only item views with green/red/dashed-green option states, full explanations, distractor breakdowns and PBQ model solutions. Prev/Next and Back-to-Grid controls work on desktop and mobile.
- **Study mode and drills** with explanations, hints, domain focus, weakest-topic retests and mixed MCQ + PBQ sessions.
- **PBQ Lab** with nine families plus a mixed set, untimed and fully explained.
- **Analytics** — readiness, domain accuracy, weak objectives, activity heatmap, score trend and attempt history.
- **Light / dark / AMOLED themes**, optional Supabase sync, and a resumable exam snapshot.

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
