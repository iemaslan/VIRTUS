"use client";

import { useCallback, useState } from "react";
import { DEMO_POST } from "../lib/fallback.js";

const STAGES = [
  { id: 1, name: "Claim extraction", kind: "model", detail: "Splits the post into atomic claims." },
  { id: 2, name: "Triage", kind: "code", detail: "Decides what is checkable at all, and says why." },
  { id: 3, name: "Source search", kind: "model", detail: "Searches the web for an origin per claim." },
  { id: 4, name: "Grading & verdict", kind: "code", detail: "Grades the returned URLs and sets the label." },
];

const VERDICT = {
  sourced: { label: "Sourced", className: "v-sourced" },
  weak: { label: "Weakly sourced", className: "v-weak" },
  untraceable: { label: "Untraceable", className: "v-untraceable" },
};

const NOT_CHECKABLE = {
  opinion: "Opinion",
  prediction: "Prediction",
  hedged: "Unattributed",
  vague: "Too vague",
};

export default function Home() {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [stages, setStages] = useState({});
  const [claims, setClaims] = useState([]);
  const [traces, setTraces] = useState({});
  const [result, setResult] = useState(null);

  const handleEvent = useCallback((event) => {
    switch (event.type) {
      case "start":
        setMeta({ demoMode: event.demoMode, model: event.model, note: event.note });
        break;
      case "stage":
        setStages((prev) => ({ ...prev, [event.id]: event.status }));
        break;
      case "claim":
        setClaims((prev) => [...prev, event.claim]);
        break;
      case "trace":
        setTraces((prev) => ({ ...prev, [event.trace.claimId]: event.trace }));
        break;
      case "complete":
        setResult(event.result);
        break;
      case "error":
        setError(event.message);
        break;
      default:
        break;
    }
  }, []);

  async function trace(e) {
    e.preventDefault();
    setError(null);
    setMeta(null);
    setStages({});
    setClaims([]);
    setTraces({});
    setResult(null);
    setRunning(true);

    try {
      const response = await fetch("/api/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.error || `Request failed (${response.status}).`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) if (line.trim()) handleEvent(JSON.parse(line));
      }
      if (buffer.trim()) handleEvent(JSON.parse(buffer));
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  const checkable = claims.filter((c) => c.triage.searchable);
  const notCheckable = claims.filter((c) => !c.triage.searchable);

  return (
    <main className="page">
      <header className="masthead">
        <div className="brand">
          <span className="mark">Claim Tracer</span>
          <span className="mark-sub">Where did this come from?</span>
        </div>
        {meta && (
          <span className={`chip ${meta.demoMode ? "chip-warn" : "chip-live"}`}>
            {meta.demoMode ? "Demo mode — fixed post and results" : `Live · ${meta.model}`}
          </span>
        )}
      </header>

      <section className="hero">
        <h1>
          Six claims, no citations.
          <br />
          Which ones are real?
        </h1>
        <p>
          Paste a post. It gets split into atomic claims, each checkable one is traced to a
          source, and every claim comes back labelled. The labels are computed in code from
          the URLs search actually returned — a source the model made up cannot reach the
          verdict, because the verdict never reads the model&apos;s prose.
        </p>
      </section>

      {meta?.note && <div className="notice">{meta.note}</div>}

      <form className="panel" onSubmit={trace}>
        <label className="field">
          <span className="field-label">Paste the post</span>
          <textarea
            required
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a thread, a screenshot transcript, a forwarded message — anything making factual claims without citing anything."
          />
          <span className="field-hint">{text.length.toLocaleString()} characters</span>
        </label>
        <div className="actions">
          <button type="submit" className="primary" disabled={running}>
            {running ? "Tracing…" : "Trace the claims"}
          </button>
          <button type="button" onClick={() => setText(DEMO_POST)}>
            Load example post
          </button>
        </div>
      </form>

      {(running || claims.length > 0) && (
        <section className="pipeline">
          {STAGES.map((stage) => {
            const status = stages[stage.id] || "pending";
            return (
              <div key={stage.id} className={`step step-${status}`}>
                <div className="step-head">
                  <span className="step-id">{stage.id}</span>
                  <span className={`step-kind kind-${stage.kind}`}>{stage.kind}</span>
                </div>
                <div className="step-name">{stage.name}</div>
                <div className="step-detail">{stage.detail}</div>
                <div className="step-status">
                  {status === "done" ? "done" : status === "running" ? "running…" : "waiting"}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {error && <div className="error">{error}</div>}

      {result && (
        <section className="panel">
          <h2>The breakdown</h2>
          <div className="stats">
            <div className="stat s-sourced">
              <span className="stat-value">{result.counts.sourced}</span>
              <span className="stat-label">sourced</span>
            </div>
            <div className="stat s-weak">
              <span className="stat-value">{result.counts.weak}</span>
              <span className="stat-label">weakly sourced</span>
            </div>
            <div className="stat s-untraceable">
              <span className="stat-value">{result.counts.untraceable}</span>
              <span className="stat-label">untraceable</span>
            </div>
            <div className="stat stat-quiet">
              <span className="stat-value">{result.notSearched}</span>
              <span className="stat-label">not checkable</span>
            </div>
          </div>
          {result.skippedForBudget > 0 && (
            <p className="sub">
              {result.skippedForBudget} additional checkable claim
              {result.skippedForBudget === 1 ? " was" : "s were"} found but not searched, to keep
              the run inside its query budget. Nothing was silently dropped.
            </p>
          )}
        </section>
      )}

      {checkable.map((claim) => {
        const trace = traces[claim.id];
        const verdict = trace ? VERDICT[trace.verdict] : null;

        return (
          <section key={claim.id} className={`panel claim ${verdict ? verdict.className : "v-pending"}`}>
            <div className="claim-head">
              <span className={`verdict-badge ${verdict ? verdict.className : ""}`}>
                {verdict ? verdict.label : "Tracing…"}
              </span>
              <h2>{claim.text}</h2>
            </div>

            <blockquote className="original">“{claim.quote}”</blockquote>

            {trace ? (
              <>
                <p className="verdict-reason">{trace.verdictReason}</p>
                {trace.summary && <p className="summary">{trace.summary}</p>}

                {trace.sources.length > 0 ? (
                  <div className="sources">
                    <h3>Sources search returned</h3>
                    {trace.sources.map((source, i) => (
                      <a
                        key={i}
                        className={`source tier-${source.tier}`}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <span className="source-tier">{source.label}</span>
                        <span className="source-title">{source.title}</span>
                        <span className="source-host">{source.host}</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="sub">Search returned nothing usable for this claim.</p>
                )}
              </>
            ) : (
              <p className="sub">Searching…</p>
            )}

            <details className="why">
              <summary>Why this was searched</summary>
              <p>{claim.triage.reason}</p>
              {claim.query && (
                <p>
                  Query sent: <code>{claim.query}</code>
                </p>
              )}
            </details>
          </section>
        );
      })}

      {notCheckable.length > 0 && (
        <section className="panel">
          <h2>Not checkable, and why</h2>
          <p className="sub">
            These were left alone deliberately. Running a search against a value judgement
            produces a confident verdict about something that was never checkable.
          </p>
          <ul className="skipped">
            {notCheckable.map((claim) => (
              <li key={claim.id}>
                <span className={`skip-badge skip-${claim.triage.kind}`}>
                  {NOT_CHECKABLE[claim.triage.kind] || claim.triage.kind}
                </span>
                <span className="skip-text">{claim.text}</span>
                <span className="skip-reason">{claim.triage.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="foot">
        <div>Claim Tracer · Team VIRTUS · DevFest DC 2026</div>
        <div className="foot-sub">
          What this cannot do: it checks whether a claim has a traceable, accountable source —
          not whether the claim is true. A government agency can publish a figure that is later
          revised, and an untraceable claim can turn out to be correct. Source tiers are assigned
          from a list of hosts written down in <code>lib/sources.js</code>, which is a judgement
          call made in advance and visible to anyone who opens the file.
        </div>
      </footer>
    </main>
  );
}
