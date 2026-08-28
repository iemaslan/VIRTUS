/**
 * Jargon detection (deterministic).
 *
 * Which words in a sentence are jargon is a question with a checkable answer,
 * so it is answered in code. Asking a model to scan every transcript chunk
 * would cost a call per sentence, arrive after the speaker had moved on, and
 * return a different set of terms each time the same talk was replayed.
 *
 * Detection is therefore a pure function of the text. The model is never asked
 * what the jargon is; it is handed terms that were already found and asked only
 * what they mean.
 *
 * Pure functions, no imports beyond a sibling glossary — testable in plain Node
 * with nothing installed.
 */

import { GLOSSARY_TERMS, AMBIGUOUS, lookup } from "./glossary.js";

/** Words that look like acronyms but carry no technical meaning. */
const ACRONYM_STOPWORDS = new Set([
  "I", "A", "OK", "TV", "US", "USA", "UK", "EU", "AM", "PM", "CEO", "CTO", "HR",
  "OH", "NO", "YES", "AND", "THE", "FOR", "BUT", "NOT", "ALL", "ONE", "TWO",
]);

/**
 * Signals that a sentence is technical enough for an ambiguous term to count.
 *
 * Deliberately contains none of the AMBIGUOUS terms: if "agent" were listed
 * here, the sentence "she was a strong agent" would prove its own technical
 * context and the guard would never reject anything.
 */
const TECHNICAL_CONTEXT = [
  "model", "api", "server", "code", "data", "request", "deploy", "build",
  "query", "latency", "database", "endpoint", "function", "vector",
  "pipeline", "runtime", "library", "inference", "embedding", "tool call",
];

export function normalize(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .trim();
}

/** Split on sentence enders, keeping a trailing fragment — live speech rarely ends tidily. */
export function splitSentences(text) {
  const clean = normalize(text);
  if (!clean) return [];
  return (clean.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || []).map((s) => s.trim()).filter(Boolean);
}

/** The term under test is removed first, so it cannot vouch for itself. */
function hasTechnicalContext(sentence, term) {
  const lower = sentence.toLowerCase().split(String(term).toLowerCase()).join(" ");
  return TECHNICAL_CONTEXT.some((w) => lower.includes(w));
}

/** Whole-word, case-insensitive, as a phrase for multiword terms. */
function termPattern(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])(${escaped})([^a-z0-9]|$)`, "i");
}

/**
 * Find the jargon in a piece of transcript.
 *
 * `known` is the set of terms already on screen; a term is reported once per
 * talk, not once per mention, because a sidebar that repeats itself is noise.
 */
export function detectTerms(text, { known = new Set() } = {}) {
  const sentences = splitSentences(text);
  const found = [];
  const seen = new Set([...known].map((t) => t.toLowerCase()));

  for (const sentence of sentences) {
    // Whatever a term matches is blanked out before the next term is tried, so the
    // longest reading wins: "ci/cd" is one term, not "ci/cd" and then "ci" again.
    let remaining = sentence;

    for (const term of GLOSSARY_TERMS) {
      if (seen.has(term)) continue;
      const pattern = termPattern(term);
      if (!pattern.test(remaining)) continue;
      if (AMBIGUOUS.has(term) && !hasTechnicalContext(sentence, term)) continue;

      remaining = remaining.replace(pattern, (_full, before, hit, after) =>
        before + "\u0000".repeat(hit.length) + after
      );
      seen.add(term);
      found.push({ term, sentence, source: "glossary", definition: lookup(term) });
    }

    // Acronyms the glossary has never heard of. Anything already claimed above is
    // blanked out by now, so a known term is never reported twice.
    for (const [, acronym] of remaining.matchAll(/\b([A-Z][A-Z0-9]{1,5})s?\b/g)) {
      const key = acronym.toLowerCase();
      if (seen.has(key) || ACRONYM_STOPWORDS.has(acronym)) continue;
      seen.add(key);
      found.push({ term: acronym, sentence, source: "acronym", definition: null });
    }
  }

  return found;
}

/**
 * The model is only ever asked about terms detection actually found, and only
 * answers that come back for those terms are kept. A definition for a term
 * nobody said is a fabrication, whatever else it is.
 */
export function acceptDefinitions(definitions, requestedTerms) {
  const wanted = new Map(requestedTerms.map((t) => [String(t).toLowerCase(), t]));
  const accepted = [];
  const rejected = [];

  for (const definition of definitions || []) {
    const key = String(definition?.term || "").toLowerCase();
    if (wanted.has(key)) accepted.push({ ...definition, term: wanted.get(key) });
    else rejected.push(definition?.term ?? null);
  }

  return { accepted, rejected };
}
