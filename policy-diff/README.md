# Policy Diff

Paste two versions of a policy, a lease, a benefits rulebook, or a set of terms.
Get the changes in plain English, ranked by how much they actually land on you.

Built for DevFest DC 2026, concept 2.1 — Plain-Language Policy Diff.

## The engineering decision

Five steps. **Four of them are code.** The model runs once.

| # | Step | Implementation | Job |
|---|------|----------------|-----|
| 1 | Segmentation | **Code** — `lib/segment.js` | Split both documents into clauses |
| 2 | Alignment & diff | **Code** — `lib/diff.js` | Pair clauses, classify, word-level diff |
| 3 | Impact scoring | **Code** — `lib/impact.js` | Rank by money, rights, deadlines, data, eligibility |
| 4 | Explanation | Claude, JSON-schema constrained | Say what each change means to a person |
| 5 | Quote verification | **Code** — `lib/verify.js` | Check every quote back against the document |

Asked to "diff these two documents", a language model will paraphrase, merge
clauses, silently skip one, and occasionally report a change that is not there.
**A diff that misses a clause is worse than no diff**, because the reader now
believes nothing changed. So the diff is computed in code, and the model is
handed a list of changes it did not choose and cannot add to.

Two invariants are enforced and tested:

- **Nothing is dropped.** Every clause on both sides lands in exactly one bucket
  — unchanged, moved, modified, added, or removed.
- **Nothing is invented.** Every quote in an explanation must appear verbatim in
  the clause it is attributed to, and an explanation referring to a change the
  diff engine never found is rejected outright.

## Running it

```bash
npm install
cp .env.example .env.local     # paste your key from console.anthropic.com
npm run dev
```

Without a key it still runs end to end, with explanations composed in code
instead of written by the model. The interface says which mode it is in.

```bash
npm test     # 17 tests, zero dependencies, no network, no API key
```

## Demo

1. Click **Load example** — a synthetic benefits rulebook, v3.1 against v4.0.
2. The top three changes come back ranked: binding arbitration added, a $45
   application fee introduced, termination notice cut from 30 days to 10.
3. Open **Why this ranked here** on any change to see the score decomposed.
4. Scroll to **Quote verification** — every quote matched the source document.

Then paste something real. That is the actual product; the example just makes
the first ten seconds fast.

## What this cannot do

It compares the text you give it and nothing else. It does not know whether a
clause is enforceable, whether the version you pasted is the current one, or
what a court would make of it. The diff, the ranking, and the quote checks are
computed in code and are reproducible. The plain-English wording is written by a
model and should be read as a summary, not as advice.

The bundled example is **synthetic** — an invented programme, not any real
policy. It is labelled as such in the interface.
