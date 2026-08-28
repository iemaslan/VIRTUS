# VIRTUS

Team VIRTUS — DevFest DC 2026, Build Edition.

A monorepo holding the team's projects. Each project lives in its own directory
and is independently installable, testable, and deployable.

## Projects

| Directory | What it is | Status |
|-----------|------------|--------|
| [`advocate-dc/`](advocate-dc/) | Two multi-agent pipelines for DC renters: turn a housing dispute into a ready-to-send action package, and find a home that fits your life and your real budget. Next.js + Claude. | Working, 38 tests passing |
| _(project 2)_ | — | Not yet added |
| _(project 3)_ | — | Not yet added |
| _(project 4)_ | — | Not yet added |
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
otherwise the build runs against the repository root and fails.
