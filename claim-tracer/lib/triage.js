/**
 * Step 2 — Claim triage (deterministic).
 *
 * Not every sentence in a post is a factual claim, and running a search against
 * "this is the best city in America" wastes a query and produces a confident
 * verdict about something that was never checkable. Separating the checkable
 * from the unfalsifiable is done in code, with visible rules, so a reader can
 * see why their sentence was not searched instead of being told it failed.
 *
 * Pure functions, no imports — testable in plain Node with nothing installed.
 */

/** Language that marks a statement as taste, not fact. */
const OPINION_MARKERS = [
  "i think", "i believe", "i feel", "in my opinion", "imo", "arguably",
  "beautiful", "ugly", "terrible", "amazing", "best", "worst", "greatest",
  "should", "ought to", "deserves", "disgusting", "brilliant", "stupid",
  "overrated", "underrated", "obviously", "clearly the",
];

/** Language that puts a statement in the future, where no source can confirm it yet. */
const PREDICTION_MARKERS = [
  "will be", "will become", "is going to", "expected to", "by 2027", "by 2028",
  "by 2030", "next year", "predict", "forecast", "on track to",
];

/** Language that hedges a claim into unfalsifiability. */
const HEDGE_MARKERS = [
  "some say", "many believe", "people are saying", "rumor", "allegedly",
  "reportedly", "sources say", "it is said",
];

const NUMBER_PATTERN = /\b\d[\d,.]*\s*(?:%|percent|million|billion|trillion|thousand|k\b)?/i;
const DATE_PATTERN = /\b(?:19|20)\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i;
const PROPER_NOUN_PATTERN = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b/;

function hits(text, markers) {
  const lower = text.toLowerCase();
  return markers.filter((m) => lower.includes(m));
}

/**
 * Decide whether a claim can be checked against a source at all, and say why.
 *
 * Returns a kind of:
 *   checkable   — a factual assertion a source could confirm or contradict
 *   opinion     — a value judgement; no source settles it
 *   prediction  — about the future; no source confirms it yet
 *   hedged      — attributed to unnamed "some people"; there is no claim to trace
 *   vague       — factual in form but with nothing specific to search for
 */
export function triageClaim(text) {
  const claim = String(text || "").trim();
  if (!claim) {
    return { kind: "vague", searchable: false, reason: "Empty claim." };
  }

  const opinion = hits(claim, OPINION_MARKERS);
  if (opinion.length) {
    return {
      kind: "opinion",
      searchable: false,
      reason: `Reads as a value judgement ("${opinion[0]}"). No source settles a matter of opinion.`,
    };
  }

  const hedged = hits(claim, HEDGE_MARKERS);
  if (hedged.length) {
    return {
      kind: "hedged",
      searchable: false,
      reason: `Attributed to unnamed people ("${hedged[0]}"). There is no specific claim to trace.`,
    };
  }

  const prediction = hits(claim, PREDICTION_MARKERS);
  if (prediction.length) {
    return {
      kind: "prediction",
      searchable: false,
      reason: `About the future ("${prediction[0]}"). No source can confirm it yet.`,
    };
  }

  const specifics = [];
  if (NUMBER_PATTERN.test(claim)) specifics.push("a figure");
  if (DATE_PATTERN.test(claim)) specifics.push("a date");
  if (PROPER_NOUN_PATTERN.test(claim)) specifics.push("a named entity");

  if (specifics.length === 0) {
    return {
      kind: "vague",
      searchable: false,
      reason: "Nothing specific to search for — no figure, date, or named entity.",
    };
  }

  return {
    kind: "checkable",
    searchable: true,
    reason: `Contains ${specifics.join(" and ")}, so a source could confirm or contradict it.`,
    specifics,
  };
}

/** Build the query actually sent to search. Deterministic, so it can be shown to the reader. */
export function buildQuery(claim) {
  // Order matters: normalise whitespace before stripping a leading conjunction,
  // or a claim that begins with a space keeps its "And ".
  return String(claim)
    .replace(/["“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:and|but|so|also|then)\s+/i, "")
    .split(" ")
    .slice(0, 28)
    .join(" ");
}
