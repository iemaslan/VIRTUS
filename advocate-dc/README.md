# Advocate DC

Two multi-agent pipelines for people renting in Washington, DC.

**Know your rights** — describe a housing dispute in plain English and get back a
ready-to-send action package: the DC law that applies, the route that fits your
situation, a drafted letter, and a verification pass that checks every legal
citation in that letter against the source data.

**Find a home** — connect what you are willing to connect, say what your life
actually looks like, and get ranked homes with the true monthly cost, the
door-to-door commute, an honest tradeoff, and the emails to send — including the
one that asks for a lower rent.

Built for DevFest DC 2026.

---

## The architecture, and why it is the point

Both products run five agents. In both, **two of the five are deliberately not
model calls.**

### Know your rights — `/`

| # | Agent | Implementation | Job |
|---|-------|----------------|-----|
| 1 | Intake & classification | Claude, JSON-schema constrained | Extract structured facts and dates from what the tenant wrote |
| 2 | Legal grounding | **Code** — `lib/retrieval.js` | Retrieve the applicable provisions from the curated corpus |
| 3 | Strategy | Claude, JSON-schema constrained | Choose demand letter, agency complaint, petition, court, or emergency |
| 4 | Drafting | Claude, streamed | Write the letter, restricted to the provisions retrieved in step 2 |
| 5 | Citation verification | **Code** — `lib/verify.js` | Check every citation in the draft against the source data |

### Find a home — `/find`

| # | Agent | Implementation | Job |
|---|-------|----------------|-----|
| 1 | Profile | Claude, JSON-schema constrained | Turn connected signals and free text into an auditable profile |
| 2 | Listing match | **Code** — `lib/homefinder/match.js` | Filter the market against hard requirements, counting every cut |
| 3 | Commute & neighborhood | **Code** — `lib/homefinder/commute.js` | Walk + wait + ride, door to door |
| 4 | Financial fit | **Code** — `lib/homefinder/budget.js` | Rent plus utilities, pet rent, transit, insurance — the real number |
| 5 | Advisor & outreach | Claude, JSON-schema constrained | Why this home fits, the honest downside, and the emails |

The split is the engineering argument: **the model is used where language and
judgment are needed, and never where correctness is.** Retrieving a statute,
counting listings, adding up a monthly budget, and checking a citation are all
things code does perfectly and a language model does approximately. Approximately
is not good enough when someone is about to send the output to their landlord.

### The citation guard

A language model asked to write a legal letter will happily invent a statute that
sounds exactly like a real one. So `lib/verify.js` trusts nothing the model wrote:

1. Every statute-shaped string in the draft is extracted by regex — `D.C. Code
   § 42-3502.17`, `14 DCMR § 301`, bare `§ 301`, even a statute written without the
   section symbol.
2. Every `[PROVISION-ID]` tag is extracted.
3. Each one is checked against the provisions that agent 2 actually retrieved.

Three ways to fail, all caught:

- **Fabricated** — `D.C. Code § 42-9999.99` does not exist in the source data.
- **Out of scope** — `§ 42-3505.02` is real DC law, but it is a retaliation
  provision that was not retrieved for a deposit case, so the draft may not lean
  on it.
- **Wrong authority** — `§ 301` exists, but under DCMR, not the D.C. Code.

This is deliberately *not* a second model call grading the first one. A
fact-checking LLM is one more thing that can hallucinate. String matching against
a known corpus cannot.

Run `npm test` to watch it work — the guard has its own test suite.

---

## Running it

```bash
npm install
cp .env.example .env.local     # then paste your key from console.anthropic.com
npm run dev
```

Open http://localhost:3000.

**Without an API key it still runs.** Both pipelines fall back to a scripted demo
mode — and in both, the deterministic agents are the real implementations, so the
citation guard, the funnel counts, and the budget math are all genuine even with
no key and no network. The interface labels demo mode clearly.

### Running on Google Cloud instead

Claude is available on Vertex AI, so a Google Cloud project can pay for the model
calls instead of an Anthropic key. Both features this codebase depends on —
structured outputs and effort control — are generally available on Vertex, so
nothing but the client construction changes:

```bash
npm install @anthropic-ai/vertex-sdk
gcloud auth application-default login
```

```bash
# .env.local
ANTHROPIC_VERTEX_PROJECT_ID=my-gcp-project
ANTHROPIC_VERTEX_REGION=global
```

`lib/agents.js` picks that path up automatically when the project ID is set, and
falls back to `ANTHROPIC_API_KEY` otherwise. The Vertex SDK is imported
dynamically, so it stays optional for everyone running on the Anthropic API.

### Tests

```bash
npm test
```

30 tests, zero dependencies, no network, no API key. They cover the citation
verifier, the retrieval layer, the deadline math, the listing funnel, the cost
model, and the negotiation logic — every part of the system where a wrong answer
would matter.

---

## Deploying

```bash
npm i -g vercel
vercel
vercel env add ANTHROPIC_API_KEY
vercel --prod
```

That gives you a live `https://<name>.vercel.app` URL. Or import the repository at
[vercel.com](https://vercel.com), add `ANTHROPIC_API_KEY` under Environment
Variables, and deploy.

---

## Demo script

**Part one — the rights pipeline (90 seconds)**

1. Open `/`, click **Deposit not returned**, submit.
2. Watch the five agents run. Point at the badges: agents 2 and 5 say `code`, not
   `model`.
3. Land on **Your clocks**: the 45-day deadline expired *N* days ago — computed in
   code from the date in the description, not written by a model.
4. Scroll to **Citation verification**: every citation green.
5. Now the moment. Tick **Plant a fake citation**, submit again. A fabricated
   statute is appended to the finished draft, and the verifier catches it, shows
   the sentence it appeared in, and fails the letter.

**Part two — the housing pipeline (90 seconds)**

1. Open `/find`, connect all three sources, submit.
2. The funnel runs live: 40 listings scanned → over budget cut → no dogs cut →
   commute cut. Every number is a real count against the dataset.
3. Land on a match card: `$2,050 rent` but `$2,321 all in`, and the itemization
   that explains the difference.
4. Scroll to **Negotiable**: 66 days on the market, ask $1,760, save $1,080 over a
   twelve-month lease — with the email already written.

---

## Honest notes

- **The legal corpus is a curated demo dataset.** `data/dcTenantLaw.json` holds 19
  provisions, each with a source link to the D.C. Council code, the DC
  regulations, or the deciding court. Verification proves the letter never cites
  outside that dataset. It does not certify the dataset itself, and the dataset is
  not a complete statement of DC tenant law.
- **The listings are a sample, not a live feed.** `data/dcListings.json` holds 40
  DC rentals held in this repository. There is no rental-platform integration, and
  the interface says so. What is real is every number computed from that data.
- **Account connections are simulated.** The Gmail, bank, and LinkedIn buttons
  contribute a fixed set of signals; nothing reads a real account. The connector
  interface in `lib/homefinder/connectors.js` is the shape a real integration
  would have to satisfy.
- **This is not legal advice.** The interface says so on every screen, and it
  points to the D.C. Office of the Tenant Advocate at (202) 719-6560.

## Where it goes next

The pipeline is domain-agnostic; the datasets are not. Swapping
`data/dcTenantLaw.json` for a medical-billing, consumer-complaint, or
insurance-denial corpus gives you the same verified-citation product in a new
vertical without touching the agent code. That is the case for building the
grounding and verification layers in code rather than in prompts.

---

## Layout

```
app/
  page.js                    tenant rights UI
  find/page.js               housing search UI
  api/advocate/route.js      rights pipeline, streamed as NDJSON
  api/homefinder/route.js    housing pipeline, streamed as NDJSON
lib/
  agents.js                  agents 1, 3, 4 — the model calls
  retrieval.js               agent 2 — deterministic legal retrieval
  verify.js                  agent 5 — deterministic citation guard
  deadlines.js               statutory clock arithmetic
  actionPlans.js             what the tenant physically does next
  homefinder/
    agents.js                profile and advisory model calls
    match.js                 deterministic filter funnel and scoring
    commute.js               deterministic door-to-door times
    budget.js                deterministic true cost of living
    negotiate.js             deterministic negotiating leverage
    connectors.js            simulated account connections
data/
  dcTenantLaw.json           19 sourced DC tenant provisions
  dcListings.json            40 sample DC rentals
  dcNeighborhoods.json       10 neighborhoods with transit and amenity data
test/                        30 tests, zero dependencies
```
