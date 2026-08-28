/**
 * Step 3 — Impact scoring (deterministic).
 *
 * "Rank changes by who they actually affect" is the difference between this and
 * a coloured text diff. The ranking is computed here rather than asked of a
 * model, so that the same two documents always produce the same order, and so
 * the reasons behind a ranking can be shown to the reader instead of asserted.
 *
 * Pure functions, with no dependency beyond a sibling helper — testable in
 * plain Node with nothing installed.
 */

import { canonical } from "./segment.js";

/**
 * Categories of language that change what a person owes, keeps, or can do.
 * Weighted by how directly the category hits someone's life, not by how
 * lawyerly it sounds.
 */
export const SIGNALS = [
  {
    id: "money",
    label: "Costs you money",
    weight: 26,
    terms: ["fee", "fees", "charge", "charged", "price", "cost", "penalty", "deposit",
            "refund", "surcharge", "payment", "billed", "interest", "non refundable"],
  },
  {
    id: "rights",
    label: "Takes away a right",
    weight: 24,
    terms: ["waive", "waiver", "forfeit", "terminate", "termination", "cancel",
            "suspend", "revoke", "deny", "prohibited", "may not", "no longer",
            "at our sole discretion", "without notice"],
  },
  {
    id: "dispute",
    label: "Changes how disputes work",
    weight: 22,
    terms: ["arbitration", "class action", "jury", "liability", "indemnify",
            "indemnification", "damages", "governing law", "venue", "sue"],
  },
  {
    id: "deadline",
    label: "Changes a deadline",
    weight: 20,
    terms: ["days", "deadline", "notice period", "within", "expire", "expires",
            "renewal", "term of", "business days", "calendar days"],
  },
  {
    id: "data",
    label: "Changes what happens to your data",
    weight: 20,
    terms: ["personal data", "personal information", "third party", "third parties",
            "share", "shared", "sell", "retain", "retention", "track", "collect",
            "biometric", "location data"],
  },
  {
    id: "eligibility",
    label: "Changes who qualifies",
    weight: 18,
    terms: ["eligible", "eligibility", "qualify", "qualifies", "requirement",
            "must provide", "required to", "income limit", "residency"],
  },
];

/** Removing a protection is not the same size of event as reordering a sentence. */
const TYPE_WEIGHT = {
  removed: 30,
  added: 22,
  modified: 18,
  moved: 2,
  unchanged: 0,
};

/** The text a change is about, on both sides. */
function changeText(change) {
  return `${change.before?.text || ""} ${change.after?.text || ""}`;
}

export function detectSignals(text) {
  const haystack = canonical(text);
  const found = [];
  for (const signal of SIGNALS) {
    const hits = signal.terms.filter((term) => haystack.includes(canonical(term)));
    if (hits.length) found.push({ id: signal.id, label: signal.label, weight: signal.weight, hits });
  }
  return found;
}

/**
 * How much of the clause actually moved, 0 to 1.
 * A clause where two words changed is not the same event as one rewritten whole.
 */
export function magnitude(change) {
  if (change.type === "added" || change.type === "removed") return 1;
  if (!change.diff) return 0;
  const touched = change.diff.wordsAdded + change.diff.wordsRemoved;
  const total = Math.max(1, (change.before?.words || 0) + (change.after?.words || 0));
  return Math.min(1, touched / total);
}

/**
 * Score one change from 0 to 100, and say why.
 * The reasons are returned alongside the number because a ranking a reader
 * cannot interrogate is a ranking they should not trust.
 */
export function scoreChange(change) {
  if (change.type === "unchanged") {
    return { score: 0, signals: [], magnitude: 0, reasons: [] };
  }

  const signals = detectSignals(changeText(change));
  const mag = magnitude(change);

  const typePoints = TYPE_WEIGHT[change.type] ?? 0;
  const signalPoints = signals.reduce((sum, s) => sum + s.weight, 0);
  const magnitudePoints = Math.round(mag * 20);

  const score = Math.min(100, Math.round(typePoints + signalPoints + magnitudePoints));

  const reasons = [];
  if (change.type === "removed") reasons.push("A clause was removed entirely.");
  if (change.type === "added") reasons.push("A clause was added that was not there before.");
  if (change.type === "modified") {
    reasons.push(
      `${change.diff.wordsAdded} word${change.diff.wordsAdded === 1 ? "" : "s"} added, ` +
        `${change.diff.wordsRemoved} removed.`
    );
  }
  for (const signal of signals) reasons.push(`${signal.label} — mentions ${signal.hits.slice(0, 3).join(", ")}.`);

  return { score, signals, magnitude: Math.round(mag * 100) / 100, reasons };
}

/** Rank the substantive changes, highest impact first. Ties break on document order. */
export function rankChanges(changes) {
  return changes
    .filter((c) => c.type !== "unchanged")
    .map((change) => ({ ...change, impact: scoreChange(change) }))
    .sort(
      (a, b) =>
        b.impact.score - a.impact.score ||
        (a.after?.index ?? a.before?.index ?? 0) - (b.after?.index ?? b.before?.index ?? 0)
    );
}

export function severityBand(score) {
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}
