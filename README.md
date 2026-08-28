# VIRTUS

Team VIRTUS — DevFest DC 2026, Build Edition.

A monorepo holding the team's projects. Each project lives in its own directory
and is independently installable, testable, and deployable.

## Projects

| Directory | What it is | Status |
|-----------|------------|--------|
| [`advocate-dc/`](advocate-dc/) | Two multi-agent pipelines for DC renters: turn a housing dispute into a ready-to-send action package, and find a home that fits your life and your real budget. Next.js + Claude. | Working, 38 tests passing |
| [`policy-diff/`](policy-diff/) | Paste two versions of a policy and get the changes in plain English, ranked by who they actually affect. The diff is computed in code; the model only explains it. Concept 2.1. | Working, 17 tests passing |
| [`jargon-sidebar/`](jargon-sidebar/) | Transcribe a live talk, catch the jargon as it lands, and keep a running sidebar of short definitions in context. Detection is computed in code; the model only defines. Concept 5.3. | Working, 11 tests passing |
| [`order-bridge/`](order-bridge/) | Two-way accessibility bridge for counter-service: cashier speech/buttons play prerecorded ASL response video; customer signs (live camera or uploaded clip), types, or taps quick requests, all reaching the cashier as English text/speech. Real MediaPipe + DTW recognition, calibrated for one intent so far. Static HTML/CSS/JS, no backend. | Working |
| _(project 5)_ | — | Not yet added |

## Working in this repo

Each project directory is self-contained — install and run from inside it, not
from the repository root:

```bash
cd advocate-dc
npm install
npm test
npm run dev
```

## Deploying a project

These are separate deployments, not one. When importing a project into Vercel,
set **Root Directory** to that project's folder (for example `advocate-dc`),
otherwise the build runs against the repository root and fails. `order-bridge/`
is a static site and is deployed separately via Netlify, pointed at that
subfolder.
