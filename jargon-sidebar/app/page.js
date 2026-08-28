"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectTerms } from "../lib/detect.js";
import { SAMPLE_TALK, SAMPLE_LABEL } from "../lib/sample.js";
import { undefinedCard } from "../lib/fallback.js";

const CATEGORY_LABEL = {
  acronym: "acronym",
  tool: "tool",
  concept: "concept",
  protocol: "protocol",
  metric: "metric",
  other: "term",
};

/** Highlight every detected term inside the transcript, longest first. */
function Highlighted({ text, terms }) {
  const pattern = useMemo(() => {
    if (!terms.length) return null;
    const escaped = [...terms]
      .sort((a, b) => b.length - a.length)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  }, [terms]);

  if (!pattern || !text) return <>{text}</>;

  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        pattern.test(part) && i % 2 === 1 ? (
          <mark className="jargon" key={i}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function Home() {
  const [supported, setSupported] = useState(null);
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [cards, setCards] = useState([]);
  const [error, setError] = useState(null);
  const [modelState, setModelState] = useState("idle");
  const [pasteMode, setPasteMode] = useState(false);
  const [pasted, setPasted] = useState("");
  const [sampleRunning, setSampleRunning] = useState(false);

  const recognitionRef = useRef(null);
  const knownRef = useRef(new Set());
  const queueRef = useRef([]);
  const timerRef = useRef(null);
  const transcriptRef = useRef(null);

  useEffect(() => {
    const SR =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    setSupported(Boolean(SR));
  }, []);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [finalText, interim]);

  /** Ask the model about the terms the glossary could not answer. */
  const flushQueue = useCallback(async () => {
    const items = queueRef.current.splice(0, 8);
    if (!items.length) return;

    setModelState("working");
    try {
      const response = await fetch("/api/define", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);

      if (data.demoMode) {
        setModelState("nokey");
        setCards((prev) =>
          prev.map((c) =>
            items.some((i) => i.term === c.term) && c.pending
              ? { ...undefinedCard(c.term), sentence: c.sentence, pending: false }
              : c
          )
        );
        return;
      }

      setModelState("live");
      setCards((prev) =>
        prev.map((c) => {
          const match = data.definitions.find((d) => d.term === c.term);
          return match ? { ...c, ...match, source: "model", pending: false } : c;
        })
      );
    } catch (err) {
      setModelState("error");
      setError(err.message);
      setCards((prev) =>
        prev.map((c) =>
          items.some((i) => i.term === c.term) && c.pending
            ? { ...undefinedCard(c.term), sentence: c.sentence, pending: false }
            : c
        )
      );
    }
  }, []);

  /** Detection runs on every finalized chunk. It is pure code — no call, no wait. */
  const ingest = useCallback(
    (chunk) => {
      if (!chunk.trim()) return;
      const found = detectTerms(chunk, { known: knownRef.current });
      if (!found.length) return;

      const fresh = [];
      for (const item of found) {
        knownRef.current.add(item.term.toLowerCase());
        if (item.source === "glossary") {
          fresh.push({
            term: item.term,
            short: item.definition,
            in_context: null,
            category: "concept",
            sentence: item.sentence,
            source: "glossary",
            pending: false,
          });
        } else {
          fresh.push({
            term: item.term,
            short: null,
            in_context: null,
            category: "acronym",
            sentence: item.sentence,
            source: "model",
            pending: true,
          });
          queueRef.current.push({ term: item.term, sentence: item.sentence });
        }
      }

      setCards((prev) => [...fresh.reverse(), ...prev]);

      if (queueRef.current.length) {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(flushQueue, 700);
      }
    },
    [flushQueue]
  );

  function start() {
    setError(null);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let settled = "";
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) settled += text;
        else live += text;
      }
      setInterim(live);
      if (settled) {
        setFinalText((prev) => (prev + " " + settled).trim());
        ingest(settled);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError("Microphone access was refused. Allow it in the browser, or use the paste box.");
      } else if (event.error !== "no-speech") {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition && listening) {
        try {
          recognition.start();
        } catch {
          setListening(false);
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function stop() {
    setListening(false);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    }
    setInterim("");
    clearTimeout(timerRef.current);
    flushQueue();
  }

  function runSample() {
    if (sampleRunning) return;
    reset();
    setSampleRunning(true);
    let i = 0;
    const tick = () => {
      if (i >= SAMPLE_TALK.length) {
        setSampleRunning(false);
        setInterim("");
        flushQueue();
        return;
      }
      const line = SAMPLE_TALK[i++];
      setFinalText((prev) => (prev + " " + line).trim());
      ingest(line);
      setTimeout(tick, 1600);
    };
    setTimeout(tick, 300);
  }

  function submitPaste(e) {
    e.preventDefault();
    if (!pasted.trim()) return;
    setFinalText(pasted.trim());
    ingest(pasted.trim());
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushQueue, 300);
  }

  function reset() {
    stop();
    setFinalText("");
    setInterim("");
    setCards([]);
    setError(null);
    setModelState("idle");
    knownRef.current = new Set();
    queueRef.current = [];
  }

  const detectedTerms = cards.map((c) => c.term);

  return (
    <main className="page">
      <header className="masthead">
        <div className="brand">
          <span className="mark">Live Jargon Sidebar</span>
          <span className="mark-sub">Definitions that keep up with the speaker</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {listening && (
            <span className="status is-live">
              <span className="dot" /> Listening
            </span>
          )}
          {modelState === "live" && (
            <span className="status is-model">
              <span className="dot" /> Claude defining unknown terms
            </span>
          )}
          {modelState === "nokey" && (
            <span className="status">
              <span className="dot" /> No API key — glossary only
            </span>
          )}
        </div>
      </header>

      <section className="hero">
        <h1>
          You lost the thread on one word.
          <br />
          Here it is, before the speaker moves on.
        </h1>
        <p>
          Point it at a talk. It transcribes as the speaker goes, catches the terms an
          audience is likely to stumble on, and keeps a running sidebar of short
          definitions — each one tied to the sentence it was actually said in.
        </p>
      </section>

      {supported === false && (
        <div className="notice warn">
          This browser has no speech recognition, so the microphone button is off. Chrome
          and Edge support it. The paste box below works everywhere and takes a real
          transcript.
        </div>
      )}

      {error && <div className="notice error">{error}</div>}

      <div className="controls">
        {!listening ? (
          <button className="primary" onClick={start} disabled={!supported || sampleRunning}>
            Start listening
          </button>
        ) : (
          <button className="stop" onClick={stop}>
            Stop
          </button>
        )}
        <button onClick={runSample} disabled={listening || sampleRunning}>
          {sampleRunning ? "Playing sample…" : "Play scripted sample"}
        </button>
        <button onClick={() => setPasteMode((v) => !v)} disabled={listening}>
          {pasteMode ? "Hide paste box" : "Paste a transcript"}
        </button>
        <button onClick={reset} disabled={listening || sampleRunning}>
          Clear
        </button>
        <span className="spacer" />
        <span className="counter">
          {cards.length} term{cards.length === 1 ? "" : "s"} caught
        </span>
      </div>

      {sampleRunning && <div className="notice warn">{SAMPLE_LABEL}</div>}

      <div className="split">
        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">Transcript</span>
            <span className="counter">{finalText.split(/\s+/).filter(Boolean).length} words</span>
          </div>

          {pasteMode ? (
            <form className="paste-wrap" onSubmit={submitPaste}>
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste a transcript, or type what the speaker said."
              />
              <div>
                <button className="primary" type="submit">
                  Find the jargon
                </button>
              </div>
            </form>
          ) : (
            <div className="transcript" ref={transcriptRef}>
              {finalText || interim ? (
                <>
                  <Highlighted text={finalText} terms={detectedTerms} />
                  {interim && <span className="interim"> {interim}</span>}
                </>
              ) : (
                <p className="empty">
                  Nothing yet. Press <strong>Start listening</strong> and talk, or play the
                  scripted sample to see the sidebar fill.
                </p>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">Sidebar</span>
            <span className="counter">newest first</span>
          </div>
          <div className="cards">
            {cards.length === 0 && (
              <p className="empty" style={{ padding: "8px 8px 14px" }}>
                Terms appear here the moment they are heard. Glossary terms render
                instantly from code; anything else is sent to the model with the sentence
                it was said in.
              </p>
            )}
            {cards.map((card, i) => (
              <article
                key={`${card.term}-${i}`}
                className={`card ${card.source === "model" ? "from-model" : ""} ${
                  card.pending ? "pending" : ""
                }`}
              >
                <div className="card-head">
                  <span className="term">{card.term}</span>
                  <span className={`chip ${card.source === "glossary" ? "code" : "model"}`}>
                    {card.source === "glossary" ? "glossary · code" : "Claude"}
                  </span>
                  {card.category && !card.pending && (
                    <span className="chip">{CATEGORY_LABEL[card.category] || card.category}</span>
                  )}
                </div>
                <p className="short">{card.pending ? "Defining…" : card.short}</p>
                {card.in_context && <p className="context">{card.in_context}</p>}
                {card.sentence && <p className="heard">“{card.sentence.trim()}”</p>}
              </article>
            ))}
          </div>
        </section>
      </div>

      <footer className="foot">
        <div>Live Jargon Sidebar · Team VIRTUS · DevFest DC 2026 · Concept 5.3</div>
        <div className="foot-sub">
          What this cannot do: it hears what the microphone hears. A mishearing becomes a
          wrong term, and the tool cannot tell a mangled word from a real one it has never
          met. Detection is computed in code and is reproducible for the same transcript;
          the definitions are written by a model and are a starting point, not a
          reference. It never defines a term that does not appear in the transcript — an
          answer for a term nobody said is discarded before it reaches the screen.
        </div>
      </footer>
    </main>
  );
}
