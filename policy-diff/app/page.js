"use client";

import { useRef, useState } from "react";
import { SAMPLE_BEFORE, SAMPLE_AFTER, SAMPLE_LABEL } from "../data/samples.js";

const DIRECTION = {
  worse_for_you: { label: "Worse for you", className: "dir-worse" },
  better_for_you: { label: "Better for you", className: "dir-better" },
  neutral: { label: "Neutral", className: "dir-neutral" },
};

const TYPE_LABEL = {
  added: "Added",
  removed: "Removed",
  modified: "Rewritten",
  moved: "Moved",
};

const QUOTE_STATUS = {
  verified: { label: "Quote verified against the document", className: "q-ok" },
  unverified: { label: "Quote not found in the document", className: "q-bad" },
  orphaned: { label: "Describes a change that was never found", className: "q-bad" },
  too_short: { label: "Quote too short to verify", className: "q-warn" },
  none: { label: "No quote offered", className: "q-warn" },
};

function WordDiff({ diff }) {
  if (!diff) return null;
  return (
    <p className="worddiff">
      {diff.parts.map((part, i) =>
        part.type === "same" ? (
          <span key={i}>{part.value}</span>
        ) : (
          <span key={i} className={part.type === "added" ? "ins" : "del"}>
            {part.value}
          </span>
        )
      )}
    </p>
  );
}

export default function Home() {
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [usedSample, setUsedSample] = useState(false);

  const beforeFile = useRef(null);
  const afterFile = useRef(null);

  function loadSample() {
    setBefore(SAMPLE_BEFORE);
    setAfter(SAMPLE_AFTER);
    setUsedSample(true);
    setResult(null);
  }

  function readFile(event, setter) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setter(String(reader.result || ""));
      setUsedSample(false);
    };
    reader.readAsText(file);
  }

  async function compare(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ before, after }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <header className="masthead">
        <div className="brand">
          <span className="mark">Policy Diff</span>
          <span className="mark-sub">What actually changed</span>
        </div>
        {result && (
          <span className={`chip ${result.demoMode || result.modelError ? "chip-warn" : "chip-live"}`}>
            {result.demoMode
              ? "No API key — explanations generated in code"
              : result.modelError
              ? "Model call failed — explanations generated in code"
              : `Live · ${result.model}`}
          </span>
        )}
      </header>

      <section className="hero">
        <h1>
          They changed the terms.
          <br />
          Here is what it costs you.
        </h1>
        <p>
          Paste two versions of a policy, a lease, a benefits rulebook, or a set of terms.
          You get the changes in plain English, ranked by how much they actually land on
          you — not in the order the lawyers wrote them.
        </p>
      </section>

      <form className="panel" onSubmit={compare}>
        <div className="docs">
          <label className="doc">
            <div className="doc-head">
              <span className="doc-label">Old version</span>
              <button type="button" className="link" onClick={() => beforeFile.current?.click()}>
                Load .txt
              </button>
              <input
                ref={beforeFile}
                type="file"
                accept=".txt,.md,text/plain"
                hidden
                onChange={(e) => readFile(e, setBefore)}
              />
            </div>
            <textarea
              required
              rows={14}
              value={before}
              onChange={(e) => {
                setBefore(e.target.value);
                setUsedSample(false);
              }}
              placeholder="Paste the version you agreed to."
            />
            <span className="doc-count">{before.length.toLocaleString()} characters</span>
          </label>

          <label className="doc">
            <div className="doc-head">
              <span className="doc-label">New version</span>
              <button type="button" className="link" onClick={() => afterFile.current?.click()}>
                Load .txt
              </button>
              <input
                ref={afterFile}
                type="file"
                accept=".txt,.md,text/plain"
                hidden
                onChange={(e) => readFile(e, setAfter)}
              />
            </div>
            <textarea
              required
              rows={14}
              value={after}
              onChange={(e) => {
                setAfter(e.target.value);
                setUsedSample(false);
              }}
              placeholder="Paste the version they just sent you."
            />
            <span className="doc-count">{after.length.toLocaleString()} characters</span>
          </label>
        </div>

        <div className="actions">
          <button type="submit" className="primary" disabled={loading}>
            {loading ? "Comparing…" : "Show me what changed"}
          </button>
          <button type="button" onClick={loadSample}>
            Load example
          </button>
          {usedSample && <span className="sample-note">{SAMPLE_LABEL}</span>}
        </div>
      </form>

      {error && <div className="error">{error}</div>}

      {result?.modelError && (
        <div className="notice">
          The diff, the ranking, and the quote checks below are unaffected — they are computed in
          code. The plain-English wording is not from the model this time: the call failed
          ({result.modelError}), so the explanations were composed in code instead.
        </div>
      )}

      {result && (
        <>
          <section className="panel">
            <h2>The short version</h2>
            <p className="lead">{result.documentSummary}</p>
            <div className="stats">
              <div className="stat">
                <span className="stat-value">{result.summary.modified}</span>
                <span className="stat-label">rewritten</span>
              </div>
              <div className="stat">
                <span className="stat-value">{result.summary.added}</span>
                <span className="stat-label">added</span>
              </div>
              <div className="stat">
                <span className="stat-value">{result.summary.removed}</span>
                <span className="stat-label">removed</span>
              </div>
              <div className="stat stat-quiet">
                <span className="stat-value">{result.summary.unchanged}</span>
                <span className="stat-label">unchanged</span>
              </div>
            </div>
            <p className="sub">
              Computed in code from {result.summary.clausesBefore} clauses in the old version
              and {result.summary.clausesAfter} in the new one. Every clause on both sides is
              accounted for in exactly one bucket.
            </p>
          </section>

          {result.ranked.length === 0 && (
            <div className="notice">Nothing substantive changed between these two versions.</div>
          )}

          {result.ranked.map((change, index) => {
            const explanation = change.explanation;
            const direction = DIRECTION[explanation?.direction] || DIRECTION.neutral;
            const quote = change.quoteCheck;
            const quoteStatus = QUOTE_STATUS[quote?.status] || QUOTE_STATUS.none;

            return (
              <section key={change.id} className={`panel change sev-${change.severity}`}>
                <div className="change-head">
                  <span className="rank">#{index + 1}</span>
                  <div className="change-title">
                    <h2>{explanation?.headline || TYPE_LABEL[change.type]}</h2>
                    <div className="badges">
                      <span className={`badge type-${change.type}`}>{TYPE_LABEL[change.type]}</span>
                      <span className={`badge ${direction.className}`}>{direction.label}</span>
                      <span className={`badge sev-badge-${change.severity}`}>
                        impact {change.impact.score}
                      </span>
                    </div>
                  </div>
                </div>

                {explanation && (
                  <>
                    <p className="means">{explanation.what_it_means}</p>
                    <p className="affected">
                      <strong>Who this lands on:</strong> {explanation.who_is_affected}
                    </p>
                  </>
                )}

                {change.type === "modified" && change.diff && (
                  <div className="block">
                    <h3>What moved</h3>
                    <WordDiff diff={change.diff} />
                  </div>
                )}

                {change.type === "added" && (
                  <div className="block">
                    <h3>New text</h3>
                    <p className="worddiff">
                      <span className="ins">{change.after.text}</span>
                    </p>
                  </div>
                )}

                {change.type === "removed" && (
                  <div className="block">
                    <h3>Text that was taken out</h3>
                    <p className="worddiff">
                      <span className="del">{change.before.text}</span>
                    </p>
                  </div>
                )}

                {quote && (
                  <div className={`quote ${quoteStatus.className}`}>
                    <div className="quote-text">“{quote.quote}”</div>
                    <div className="quote-status">
                      {quoteStatus.className === "q-ok" ? "✓" : "✕"} {quoteStatus.label}
                      {quote.source && ` (${quote.source === "after" ? "new" : "old"} version)`}
                    </div>
                  </div>
                )}

                <details className="why">
                  <summary>Why this ranked here</summary>
                  <ul>
                    {change.impact.reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </details>
              </section>
            );
          })}

          <section className={`panel verify ${result.verification.passed ? "verify-pass" : "verify-fail"}`}>
            <h2>Quote verification</h2>
            <div className="verdict">
              <span className="verdict-mark">{result.verification.passed ? "✓" : "✕"}</span>
              <div>
                <div className="verdict-title">
                  {result.verification.passed
                    ? "Every quote above appears verbatim in the document it is attributed to."
                    : `${result.verification.summary.problems} quote${
                        result.verification.summary.problems === 1 ? "" : "s"
                      } could not be found in the source.`}
                </div>
                <div className="verdict-sub">
                  {result.verification.summary.verified} of {result.verification.summary.checked}{" "}
                  verified by string match against the pasted text. The explanations are written by
                  a model; the check that they quote the real document is not.
                </div>
              </div>
            </div>
          </section>

          {result.truncated > 0 && (
            <div className="notice">
              {result.truncated} lower-impact change{result.truncated === 1 ? " was" : "s were"} found
              and ranked, but not explained. Nothing was silently dropped.
            </div>
          )}
        </>
      )}

      <footer className="foot">
        <div>Policy Diff · Team VIRTUS · DevFest DC 2026</div>
        <div className="foot-sub">
          What this cannot do: it compares the text you give it and nothing else. It does not know
          whether a clause is enforceable, whether the new version is the current one, or what a
          court would make of it. The diff, the ranking, and the quote checks are computed in code
          and are reproducible; the plain-English wording is written by a model and should be read
          as a summary, not as advice.
        </div>
      </footer>
    </main>
  );
}
