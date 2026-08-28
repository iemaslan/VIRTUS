# Claim Tracer

Paste a post. Get every claim in it split apart, traced to a source, and
labelled **Sourced**, **Weakly Sourced**, or **Untraceable**.

Built for DevFest DC 2026, concept 1.1 — Claim Tracer.

## The engineering decision

Four steps. **Two of them are code, and they are the two that decide anything.**

| # | Step | Implementation | Job |
|---|------|----------------|-----|
| 1 | Claim extraction | Claude, JSON-schema constrained | Split prose into atomic claims |
| 2 | Triage | **Code** — `lib/triage.js` | Decide what is checkable at all, and say why |
| 3 | Source search | Claude + server-side web search | Find an origin per claim |
| 4 | Grading & verdict | **Code** — `lib/sources.js` | Grade the URLs and set the label |

### A source the model invents cannot reach the verdict

This is the known failure mode of every citation tool: the model writes a
confident URL that does not exist, or attributes a claim to a source that never
made it. Here that is prevented structurally rather than checked afterwards.

The URLs are read out of the **search tool's own structured result blocks** —
the list the search engine returned — and never out of the model's prose. The
model is told explicitly not to write URLs, and anything it writes as a link is
discarded. The verdict function then runs over that list in code.

So the guarantee is not "the model was careful". It is that the code path which
produces the verdict never reads model-generated text at all.

### Not everything deserves a search

Running a search against "this is the worst housing policy I have ever seen"
produces a confident verdict about something that was never checkable. Step 2
separates claims into checkable, opinion, prediction, unattributed, and vague —
in code, with rules you can read — and shows the reader which bucket their
sentence landed in and why.

### Verdicts mean something fixed

From `lib/sources.js`, and pinned by tests:

- **Sourced** — at least one primary source, or two independent newsrooms.
- **Weakly sourced** — something accountable, but nothing primary and no
  independent confirmation. Two links from the same newsroom is not two sources.
- **Untraceable** — only self-published or unclassified results, or none at all.

## Running it

```bash
npm install
cp .env.example .env.local     # paste your key from console.anthropic.com
npm run dev
```

Without a key it runs in demo mode over a fixed post and fixed search results.
The triage, grading, and verdicts are the real implementations running over that
fixture, so the part that decides anything is genuinely exercised.

```bash
npm test     # 17 tests, zero dependencies, no network, no API key
```

## Demo

1. **Load example post** — a DC housing post making seven claims and citing nothing.
2. Watch the four stages run. Two say `code`, two say `model`.
3. The breakdown comes back: sourced, weakly sourced, untraceable, and not checkable.
4. Open **Why this was searched** on any claim to see the triage rule and the exact query.
5. Then paste something real from your own feed. That is the actual product.

## What this cannot do

It checks whether a claim has a traceable, accountable source — **not whether the
claim is true**. An agency can publish a figure that is later revised, and an
untraceable claim can turn out to be correct.

Source tiers come from a list of hosts in `lib/sources.js`. That list is a
judgement made in advance by the people who wrote it, and anyone can open the
file and disagree with it. That is the point of putting it in a file rather than
in a prompt.
