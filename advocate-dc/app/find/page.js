"use client";

import { useCallback, useState } from "react";
import { HOME_AGENTS } from "../../lib/pipeline.js";
import { CONNECTORS } from "../../lib/homefinder/connectors.js";

const HUB_LABELS = {
  downtown: "Downtown / Metro Center",
  dupont: "Dupont Circle",
  foggy_bottom: "Foggy Bottom / GWU",
  capitol_hill: "Capitol Hill / Union Station",
  navy_yard: "Navy Yard",
  bethesda: "Bethesda / NIH",
  pentagon_city: "Pentagon City",
  howard: "Howard University",
};

const LIFESTYLE_LABELS = {
  running: "running",
  dog: "dog owner",
  coffee: "coffee",
  nightlife: "nightlife",
  fitness: "gym",
  quiet: "quiet",
  outdoors: "outdoor space",
};

/** A generated cover image, so no listing is illustrated with a photo of someone else's home. */
function Cover({ listing }) {
  const seed = listing.id.split("-")[1] ? Number(listing.id.split("-")[1]) : 1;
  const hue = (seed * 37) % 360;
  const buildings = [0, 1, 2, 3, 4].map((i) => ({
    x: 12 + i * 34,
    h: 40 + ((seed * (i + 3)) % 62),
  }));

  return (
    <svg className="cover" viewBox="0 0 180 120" role="img" aria-label={`${listing.neighborhood} illustration`}>
      <defs>
        <linearGradient id={`sky-${listing.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue} 45% 62%)`} />
          <stop offset="100%" stopColor={`hsl(${(hue + 40) % 360} 40% 40%)`} />
        </linearGradient>
      </defs>
      <rect width="180" height="120" fill={`url(#sky-${listing.id})`} />
      {buildings.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={120 - b.h} width="26" height={b.h} fill="rgba(0,0,0,0.32)" />
          {[0, 1, 2].map((c) =>
            [0, 1, 2, 3].map((r) =>
              120 - b.h + 10 + r * 14 < 112 ? (
                <rect
                  key={`${c}-${r}`}
                  x={b.x + 4 + c * 8}
                  y={120 - b.h + 8 + r * 14}
                  width="4"
                  height="7"
                  fill={(seed + i + c + r) % 3 === 0 ? "rgba(255,225,160,0.85)" : "rgba(255,255,255,0.2)"}
                />
              ) : null
            )
          )}
        </g>
      ))}
      <text x="10" y="18" className="cover-label">
        {listing.neighborhood}
      </text>
    </svg>
  );
}

export default function FindHome() {
  const [connectors, setConnectors] = useState([]);
  const [description, setDescription] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const [statuses, setStatuses] = useState({});
  const [signals, setSignals] = useState([]);
  const [profile, setProfile] = useState(null);
  const [funnel, setFunnel] = useState([]);
  const [matches, setMatches] = useState([]);
  const [noMatches, setNoMatches] = useState(null);
  const [copied, setCopied] = useState(null);

  const toggleConnector = (id) =>
    setConnectors((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const handleEvent = useCallback((event) => {
    switch (event.type) {
      case "start":
        setMeta({ demoMode: event.demoMode, model: event.model, listingCount: event.listingCount });
        break;
      case "signals":
        setSignals(event.signals);
        break;
      case "agent":
        setStatuses((prev) => ({ ...prev, [event.id]: event.status }));
        if (event.status === "done" && event.data?.profile) setProfile(event.data.profile);
        break;
      case "funnel_step":
        setFunnel((prev) => [...prev, event.step]);
        break;
      case "match":
        setMatches((prev) => [...prev, event.match]);
        break;
      case "no_matches":
        setNoMatches(event.message);
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
    setError(null);
    setMeta(null);
    setStatuses({});
    setSignals([]);
    setProfile(null);
    setFunnel([]);
    setMatches([]);
    setNoMatches(null);
    setRunning(true);

    try {
      const response = await fetch("/api/homefinder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectors, description }),
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

  function copy(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <main className="page">
      <header className="masthead">
        <span className="eyebrow">Housing search</span>
        <div className="masthead-chips">
          <span className="chip chip-neutral">Sample DC dataset · 40 listings</span>
          {meta && (
            <span className={`chip ${meta.demoMode ? "chip-warn" : "chip-live"}`}>
              {meta.demoMode ? "Demo mode — no API key set" : `Live · ${meta.model}`}
            </span>
          )}
        </div>
      </header>

      <section className="hero">
        <h1>
          Zillow shows you apartments.
          <br />
          This finds you somewhere to live.
        </h1>
        <p>
          Connect what you are comfortable connecting, say what your life actually looks
          like, and five agents do the rest: build your profile, filter the market against
          your hard requirements, compute the true monthly cost and the door-to-door
          commute, and write the emails — including the one that asks for a lower rent.
        </p>
      </section>

      <form className="panel" onSubmit={handleSubmit}>
        <h2>
          <span className="num">1</span> Connect your context
        </h2>
        <p className="sub">
          Simulated connections. Nothing here reads a real account — each one contributes a
          fixed set of signals so the personalization step can be shown end to end.
        </p>

        <div className="connectors">
          {CONNECTORS.map((connector) => {
            const on = connectors.includes(connector.id);
            return (
              <button
                key={connector.id}
                type="button"
                className={`connector ${on ? "connector-on" : ""}`}
                onClick={() => toggleConnector(connector.id)}
              >
                <span className="connector-icon">{connector.icon}</span>
                <span className="connector-body">
                  <span className="connector-label">{connector.label}</span>
                  <span className="connector-blurb">{connector.blurb}</span>
                </span>
                <span className="connector-state">{on ? "connected" : "connect"}</span>
              </button>
            );
          })}
        </div>

        <label className="field">
          <span className="field-label">Anything the accounts would not know</span>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="I want in-unit laundry, I run in the mornings, and I would rather be somewhere quiet than somewhere central. Moving in October."
          />
        </label>

        <div className="actions">
          <button type="submit" className="primary" disabled={running || (!connectors.length && !description.trim())}>
            {running ? "Agents working…" : "Find my home"}
          </button>
          <span className="hint-inline">
            {connectors.length
              ? `${connectors.length} source${connectors.length === 1 ? "" : "s"} connected`
              : "Connect a source or describe what you want"}
          </span>
        </div>
      </form>

      {signals.length > 0 && (
        <section className="panel">
          <h2>
            <span className="num">◎</span> What the connected sources say
          </h2>
          <ul className="signals">
            {signals.map((signal, i) => (
              <li key={i}>
                <span className="signal-source">{signal.source}</span>
                {signal.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(running || matches.length > 0 || noMatches) && (
        <section className="pipeline">
          {HOME_AGENTS.map((agent) => {
            const status = statuses[agent.id] || "pending";
            return (
              <div key={agent.id} className={`step step-${status}`}>
                <div className="step-head">
                  <span className="step-id">{agent.id}</span>
                  <span className={`step-kind kind-${agent.kind}`}>{agent.kind}</span>
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

      {profile && (
        <section className="panel">
          <h2>
            <span className="num">2</span> Your profile
          </h2>
          <p className="lead">{profile.headline}</p>

          <div className="profile-grid">
            <div className="profile-stat">
              <span className="profile-stat-value">${profile.max_budget?.toLocaleString()}</span>
              <span className="profile-stat-label">
                {profile.budget_basis === "all_in" ? "all-in ceiling" : "rent ceiling"}
              </span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value">{profile.max_commute_minutes} min</span>
              <span className="profile-stat-label">
                to {profile.work_label || HUB_LABELS[profile.work_location] || "work"}
              </span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value">
                {profile.bedrooms_min === 0 ? "Studio+" : `${profile.bedrooms_min}BR+`}
              </span>
              <span className="profile-stat-label">
                {profile.has_dog ? `with a ${profile.dog_weight_lbs || ""} lb dog` : "no pets"}
              </span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value">{profile.has_car ? "Car" : "Car-free"}</span>
              <span className="profile-stat-label">
                {profile.has_car ? "parking needed" : "metro dependent"}
              </span>
            </div>
          </div>

          <div className="tags">
            {(profile.lifestyle || []).map((item) => (
              <span key={item} className="tag">
                {LIFESTYLE_LABELS[item] || item}
              </span>
            ))}
          </div>

          {profile.assumptions?.length > 0 && (
            <div className="assumptions">
              <h3>Assumed, not stated — correct anything wrong</h3>
              <ul>
                {profile.assumptions.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {funnel.length > 0 && (
        <section className="panel">
          <h2>
            <span className="num">3</span> How the market narrowed
            <span className="badge badge-code">counted in code</span>
          </h2>
          <p className="sub">
            Every number below is a real count against the dataset, not an animation.
          </p>
          <ol className="funnel">
            {funnel.map((step, i) => (
              <li key={i} className={step.removed > 0 ? "funnel-cut" : "funnel-keep"}>
                <span className="funnel-label">{step.label}</span>
                <span className="funnel-numbers">
                  {step.removed > 0 && <span className="funnel-removed">−{step.removed}</span>}
                  <span className="funnel-remaining">{step.remaining} left</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {noMatches && <div className="error">{noMatches}</div>}

      {matches.map((match, index) => {
        const { listing, cost, commute, leverage, brief, split, scored, neighborhood } = match;
        return (
          <section key={listing.id} className="panel match">
            <div className="match-head">
              <Cover listing={listing} />
              <div className="match-title">
                <div className="match-rank">#{index + 1} best fit</div>
                <h2 className="match-address">{listing.address}</h2>
                <div className="match-specs">
                  {listing.neighborhood} · {listing.beds === 0 ? "Studio" : `${listing.beds} bed`} ·{" "}
                  {listing.baths} bath · {listing.sqft.toLocaleString()} sq ft
                </div>
                <div className="match-rent">
                  ${listing.rent.toLocaleString()}
                  <span className="match-rent-unit">/mo asking</span>
                </div>
              </div>
              <div className="match-score">
                <div className="score-value">{scored.score}</div>
                <div className="score-label">fit score</div>
              </div>
            </div>

            <p className="lead">{brief.verdict}</p>

            <div className="highlights">
              {brief.highlights.map((highlight, i) => (
                <div key={i} className="highlight">
                  <span className="highlight-icon">{highlight.icon}</span>
                  <span>{highlight.text}</span>
                </div>
              ))}
            </div>

            <div className="tradeoff">{brief.tradeoff}</div>

            <div className="detail-grid">
              <div className="detail-card">
                <h3>What it really costs</h3>
                <table className="cost">
                  <tbody>
                    {cost.lines.map((line, i) => (
                      <tr key={i}>
                        <td>
                          {line.label}
                          {line.note && <span className="cost-note">{line.note}</span>}
                        </td>
                        <td className="cost-amount">
                          {line.amount === 0 ? "—" : `$${line.amount.toLocaleString()}`}
                        </td>
                      </tr>
                    ))}
                    <tr className="cost-total">
                      <td>True monthly cost</td>
                      <td className="cost-amount">${cost.total.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
                <div className={`budget-verdict verdict-${cost.verdict}`}>{cost.summary}</div>
                {split && (
                  <div className="split-note">
                    Shared with {split.housemates - 1}{" "}
                    {split.housemates - 1 === 1 ? "housemate" : "housemates"}:{" "}
                    <strong>${split.perPerson.toLocaleString()}/mo</strong>{" "}
                    each — ${split.saving.toLocaleString()} less than taking it alone
                    {split.fits ? ", and inside your budget." : "."}
                  </div>
                )}
              </div>

              <div className="detail-card">
                <h3>Getting to work</h3>
                {commute ? (
                  <>
                    <div className="commute-total">
                      {commute.totalMinutes} <span>minutes door to door</span>
                    </div>
                    <ul className="commute-legs">
                      {commute.breakdown.map((leg, i) => (
                        <li key={i}>
                          <span>{leg.label}</span>
                          <span className="leg-min">{leg.minutes} min</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="sub">No work location given, so no commute was computed.</p>
                )}
                {neighborhood && (
                  <div className="hood">
                    <div className="hood-scores">
                      <span>Walk {neighborhood.walk_score}</span>
                      <span>Transit {neighborhood.transit_score}</span>
                    </div>
                    <p>{neighborhood.vibe}</p>
                  </div>
                )}
              </div>
            </div>

            {leverage.hasLeverage && (
              <div className="leverage">
                <div className="leverage-head">
                  <span className="leverage-badge">Negotiable</span>
                  <span>
                    {leverage.daysOnMarket} days on the market — {leverage.note}
                  </span>
                </div>
                <div className="leverage-figures">
                  <div>
                    <span className="leverage-value">${leverage.askRent.toLocaleString()}</span>
                    <span className="leverage-label">what to ask for</span>
                  </div>
                  <div>
                    <span className="leverage-value">${leverage.monthlySaving.toLocaleString()}/mo</span>
                    <span className="leverage-label">saved if they agree</span>
                  </div>
                  <div>
                    <span className="leverage-value">${leverage.annualSaving.toLocaleString()}</span>
                    <span className="leverage-label">over a twelve-month lease</span>
                  </div>
                </div>
              </div>
            )}

            <div className="emails">
              <div className="email">
                <div className="email-head">
                  <h3>Inquiry email</h3>
                  <button type="button" onClick={() => copy(brief.outreach_email, `${listing.id}-out`)}>
                    {copied === `${listing.id}-out` ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre>{brief.outreach_email}</pre>
              </div>

              {brief.negotiation_email && (
                <div className="email">
                  <div className="email-head">
                    <h3>Negotiation email</h3>
                    <button type="button" onClick={() => copy(brief.negotiation_email, `${listing.id}-neg`)}>
                      {copied === `${listing.id}-neg` ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre>{brief.negotiation_email}</pre>
                </div>
              )}
            </div>
          </section>
        );
      })}

      <footer className="foot">
        <div>Advocate DC · built for DevFest DC 2026</div>
        <div className="foot-sub">
          Listings are a curated sample of the DC market held in this repository, not a live
          feed from any rental platform. Account connections are simulated. Commute times,
          monthly costs, and negotiating leverage are computed in code from that dataset, so
          every figure shown is reproducible.
        </div>
      </footer>
    </main>
  );
}
