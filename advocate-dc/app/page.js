"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AGENTS } from "../lib/pipeline.js";

const CATEGORY_LABELS = {
  security_deposit: "Security deposit",
  repair_habitability: "Repairs & habitability",
  retaliation: "Retaliation",
  illegal_rent_increase: "Unlawful rent increase",
  eviction: "Eviction",
  other: "Other tenancy issue",
};

const EXAMPLES = [
  {
    label: "Deposit not returned",
    text: "My lease ended on June 30, 2026 and I moved out that day. It is almost two months later and my landlord still has not returned my $1,800 security deposit. He never sent me any notice explaining a deduction, and he has stopped replying to my emails. I lived in the apartment for two years.",
  },
  {
    label: "Repairs ignored",
    text: "There has been mold in my bathroom and no hot water for six weeks. I emailed my property manager on July 5, 2026 and again on July 20, and sent photos both times. Nothing has been fixed and now they say I have to pay for the repair myself.",
  },
  {
    label: "Rent raised after complaining",
    text: "I called 311 and requested a housing inspection on May 2, 2026 because of a broken furnace. Three weeks later my landlord sent me a notice raising my rent by 22 percent, and told me he is not renewing my lease. My rent was last raised in October 2025.",
  },
];

const STATUS_COPY = {
  verified: "Verified against source data",
  unverified: "Not found in source data",
  wrong_authority: "Cited under the wrong authority",
};

export default function Home() {
  const [description, setDescription] = useState("");
  const [tenant, setTenant] = useState({ name: "", address: "", landlord: "" });
  const [sabotage, setSabotage] = useState(false);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [statuses, setStatuses] = useState({});
  const [stage, setStage] = useState({});
  const [letter, setLetter] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const resultsRef = useRef(null);

  const reset = () => {
    setError(null);
    setMeta(null);
    setStatuses({});
    setStage({});
    setLetter("");
    setResult(null);
  };

  const handleEvent = useCallback((event) => {
    switch (event.type) {
      case "start":
        setMeta({ demoMode: event.demoMode, model: event.model });
        break;
      case "agent":
        setStatuses((prev) => ({ ...prev, [event.id]: event.status }));
        if (event.status === "done" && event.data) {
          setStage((prev) => ({ ...prev, ...event.data }));
        }
        break;
      case "letter_delta":
        setLetter((prev) => prev + event.text);
        break;
      case "complete":
        setResult(event.result);
        setLetter(event.result.letter);
        break;
      case "error":
        setError(event.message);
        break;
      default:
        break;
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    reset();
    setRunning(true);

    try {
      const response = await fetch("/api/advocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          tenant,
          injectFabricatedCitation: sabotage,
        }),
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
        for (const line of lines) {
          if (line.trim()) handleEvent(JSON.parse(line));
        }
      }
      if (buffer.trim()) handleEvent(JSON.parse(buffer));

      requestAnimationFrame(() =>
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  function copyLetter() {
    navigator.clipboard.writeText(letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadLetter() {
    const blob = new Blob([letter], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "advocate-dc-letter.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  const verification = result?.verification || stage.verification;
  const provisions = result?.provisions || stage.provisions;
  const deadlines = result?.deadlines || stage.deadlines;
  const classification = result?.classification || stage.classification;
  const strategy = result?.strategy || stage.strategy;
  const actionPlan = result?.actionPlan || stage.actionPlan;

  const expired = useMemo(
    () => (deadlines || []).filter((d) => d.status === "expired"),
    [deadlines]
  );

  return (
    <main className="page">
      <header className="masthead">
        <div className="masthead-left">
          <span className="eyebrow">Tenant rights</span>
        </div>
        {meta && (
          <span className={`chip ${meta.demoMode ? "chip-warn" : "chip-live"}`}>
            {meta.demoMode ? "Demo mode — no API key set" : `Live · ${meta.model}`}
          </span>
        )}
      </header>

      <section className="hero">
        <h1>
          Tell it what happened.
          <br />
          Get something you can actually send.
        </h1>
        <p>
          Describe your housing problem in your own words. Five agents turn it into an
          action package: the DC law that applies, the route that fits your situation, a
          drafted letter, and a verification pass that checks every legal citation in that
          letter against the source data.
        </p>
      </section>

      <div className="notice">
        <strong>This is not legal advice.</strong> Advocate drafts documents and points you
        to the right office. For anything consequential, talk to the D.C. Office of the
        Tenant Advocate at (202) 719-6560 or a tenant attorney.
      </div>

      <form className="panel" onSubmit={handleSubmit}>
        <div className="examples">
          <span className="examples-label">Try one:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              className="example"
              onClick={() => setDescription(example.text)}
            >
              {example.label}
            </button>
          ))}
        </div>

        <label className="field">
          <span className="field-label">What happened?</span>
          <textarea
            required
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dates matter. Include when things happened, what you asked for, and how your housing provider responded."
          />
          <span className="field-hint">{description.length} characters</span>
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Your name</span>
            <input
              value={tenant.name}
              onChange={(e) => setTenant({ ...tenant, name: e.target.value })}
              placeholder="Optional"
            />
          </label>
          <label className="field">
            <span className="field-label">Property address</span>
            <input
              value={tenant.address}
              onChange={(e) => setTenant({ ...tenant, address: e.target.value })}
              placeholder="Optional"
            />
          </label>
          <label className="field">
            <span className="field-label">Housing provider</span>
            <input
              value={tenant.landlord}
              onChange={(e) => setTenant({ ...tenant, landlord: e.target.value })}
              placeholder="Optional"
            />
          </label>
        </div>

        <div className="actions">
          <button type="submit" className="primary" disabled={running}>
            {running ? "Agents working…" : "Build my action package"}
          </button>
          <label className="sabotage" title="Appends a plausible but fabricated statute to the finished draft, so you can watch the verifier reject it.">
            <input
              type="checkbox"
              checked={sabotage}
              onChange={(e) => setSabotage(e.target.checked)}
            />
            Plant a fake citation (demo the guard)
          </label>
        </div>
      </form>

      {(running || result) && (
        <section className="pipeline">
          {AGENTS.map((agent) => {
            const status = statuses[agent.id] || "pending";
            return (
              <div key={agent.id} className={`step step-${status}`}>
                <div className="step-head">
                  <span className="step-id">{agent.id}</span>
                  <span className={`step-kind kind-${agent.kind}`}>
                    {agent.kind === "code" ? "code" : "model"}
                  </span>
                </div>
                <div className="step-name">{agent.name}</div>
                <div className="step-detail">{agent.detail}</div>
                <div className="step-status">
                  {status === "done" ? "done" : status === "running" ? "running…" : "waiting"}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {error && <div className="error">{error}</div>}

      <div ref={resultsRef} className="results">
        {classification && (
          <section className="panel">
            <h2>
              <span className="num">1</span> Case summary
            </h2>
            <div className="tags">
              <span className="tag tag-strong">
                {CATEGORY_LABELS[classification.category] || classification.category}
              </span>
              <span className={`tag sev-${classification.severity}`}>
                {classification.severity} severity
              </span>
              {classification.money_at_stake != null && (
                <span className="tag">${classification.money_at_stake.toLocaleString()} at stake</span>
              )}
            </div>
            <p className="lead">{classification.summary}</p>

            <div className="split">
              <div>
                <h3>Facts on the record</h3>
                <ul>
                  {classification.key_facts.map((fact, i) => (
                    <li key={i}>{fact}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Find these before you send anything</h3>
                <ul>
                  {classification.missing_information.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {deadlines && deadlines.length > 0 && (
          <section className="panel">
            <h2>
              <span className="num">⏱</span> Your clocks
            </h2>
            <p className="sub">
              Computed in code from the dates in your description — not written by a model.
            </p>
            <div className="clocks">
              {deadlines.map((clock) => (
                <div key={clock.provisionId} className={`clock clock-${clock.status}`}>
                  <div className="clock-days">
                    {clock.daysRemaining < 0
                      ? `${Math.abs(clock.daysRemaining)} days past`
                      : `${clock.daysRemaining} days left`}
                  </div>
                  <div className="clock-title">{clock.title}</div>
                  <div className="clock-meta">
                    {clock.days} days from {clock.countsFrom} ({clock.startDate}) · due{" "}
                    {clock.dueDate}
                  </div>
                  <div className="clock-auth">{clock.authority}</div>
                </div>
              ))}
            </div>
            {expired.length > 0 && (
              <p className="clock-note">
                A missed deadline is usually your strongest argument, not a lost cause — it
                is the housing provider who missed it.
              </p>
            )}
          </section>
        )}

        {provisions && (
          <section className="panel">
            <h2>
              <span className="num">2</span> The law that applies
              <span className="badge badge-code">retrieved in code</span>
            </h2>
            <p className="sub">
              These {provisions.length} provisions are the only legal authority the drafting
              agent was given. It cannot cite anything else.
            </p>
            <div className="provisions">
              {provisions.map((provision) => (
                <article key={provision.id} className="provision">
                  <header>
                    <h3>{provision.title}</h3>
                    <code className="authority">{provision.authority}</code>
                  </header>
                  <p>{provision.summary}</p>
                  <p className="tenant-action">
                    <strong>What this means for you:</strong> {provision.tenant_action}
                  </p>
                  <footer>
                    <code className="pid">[{provision.id}]</code>
                    <a href={provision.source_url} target="_blank" rel="noreferrer">
                      Read the source ↗
                    </a>
                  </footer>
                </article>
              ))}
            </div>
          </section>
        )}

        {strategy && (
          <section className="panel">
            <h2>
              <span className="num">3</span> Recommended route
            </h2>
            <div className="strategy">
              <div className="strategy-path">{actionPlan?.label || strategy.path}</div>
              <p>{strategy.reasoning}</p>
              <dl>
                <div>
                  <dt>Ask for</dt>
                  <dd>{strategy.what_to_ask_for}</dd>
                </div>
                <div>
                  <dt>Give them</dt>
                  <dd>{strategy.response_window_days} days to respond</dd>
                </div>
                <div>
                  <dt>If ignored</dt>
                  <dd>{strategy.escalation}</dd>
                </div>
              </dl>
            </div>
          </section>
        )}

        {letter && (
          <section className="panel letter-panel">
            <h2>
              <span className="num">4</span> Your letter
            </h2>
            <p className="sub">
              Editable. The bracketed identifiers trace each legal claim back to its source
              — delete them before sending, or leave them in to show your work.
            </p>
            <textarea
              className="letter"
              rows={20}
              value={letter}
              onChange={(e) => setLetter(e.target.value)}
            />
            <pre className="print-only">{letter}</pre>
            <div className="btn-row">
              <button type="button" className="primary" onClick={copyLetter}>
                {copied ? "Copied" : "Copy letter"}
              </button>
              <button type="button" onClick={downloadLetter}>
                Download .txt
              </button>
              <button type="button" onClick={() => window.print()}>
                Print / save as PDF
              </button>
            </div>
          </section>
        )}

        {verification && (
          <section className={`panel verify ${verification.passed ? "verify-pass" : "verify-fail"}`}>
            <h2>
              <span className="num">5</span> Citation verification
              <span className="badge badge-code">checked in code</span>
            </h2>

            <div className="verdict">
              <div className="verdict-mark">{verification.passed ? "✓" : "✕"}</div>
              <div>
                <div className="verdict-title">
                  {verification.passed
                    ? "Every legal citation in this letter exists in the source data."
                    : `${verification.summary.problemCount} citation${
                        verification.summary.problemCount === 1 ? "" : "s"
                      } could not be verified.`}
                </div>
                <div className="verdict-sub">
                  {verification.summary.citationsChecked} statutory citation
                  {verification.summary.citationsChecked === 1 ? "" : "s"} and{" "}
                  {verification.summary.tagsChecked} provision tag
                  {verification.summary.tagsChecked === 1 ? "" : "s"} checked against{" "}
                  {verification.summary.provisionsAvailable} retrieved provisions. No model
                  was asked to grade its own work.
                </div>
              </div>
            </div>

            {verification.citations.length > 0 && (
              <ul className="cite-list">
                {verification.citations.map((citation, i) => (
                  <li key={i} className={`cite cite-${citation.status}`}>
                    <div className="cite-head">
                      <code>{citation.raw}</code>
                      <span className="cite-status">{STATUS_COPY[citation.status]}</span>
                    </div>
                    <div className="cite-context">{citation.context}</div>
                    <div className="cite-message">{citation.message}</div>
                  </li>
                ))}
              </ul>
            )}

            {verification.tags.length > 0 && (
              <div className="tag-check">
                {verification.tags.map((tag, i) => (
                  <span key={i} className={`tag-pill tag-${tag.status}`}>
                    {tag.status === "verified" ? "✓" : "✕"} [{tag.id}]
                  </span>
                ))}
              </div>
            )}

            {!verification.passed && (
              <p className="verify-note">
                Unverified citations are the model reaching past its evidence. Remove them
                from the letter before you send it.
              </p>
            )}
          </section>
        )}

        {actionPlan && (
          <section className="panel">
            <h2>
              <span className="num">6</span> What you do next
            </h2>
            <p className="venue">{actionPlan.venue}</p>
            <ol className="plan">
              {actionPlan.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <footer className="foot">
        <div>
          Advocate DC · built for DevFest DC 2026 · agents 2 and 5 are deterministic code by
          design
        </div>
        <div className="foot-sub">
          The legal corpus is a curated demo dataset with a source link on every provision.
          Verification proves the letter never cites outside that dataset; it does not
          certify the dataset itself.
        </div>
      </footer>
    </main>
  );
}
