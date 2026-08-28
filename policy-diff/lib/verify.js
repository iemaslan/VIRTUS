/**
 * Step 5 — Quote verification (deterministic).
 *
 * The model explains each change in plain language, and to be useful those
 * explanations quote the document. A quote is exactly the kind of thing a
 * language model will produce fluently and inaccurately: close to the wording,
 * not identical to it, and occasionally invented outright.
 *
 * So every quote is checked back against the clause it claims to come from. A
 * quote that is not in the source is reported as unverified rather than shown
 * as if it were the document speaking.
 *
 * Pure functions, with no dependency beyond a sibling helper — testable in
 * plain Node with nothing installed.
 */

import { canonical } from "./segment.js";

/** Quotes shorter than this are too generic for containment to mean anything. */
const MIN_QUOTE_WORDS = 3;

export function verifyQuote(quote, change) {
  const text = String(quote || "").trim();
  if (!text) {
    return { quote: text, status: "none", message: "No quote was offered for this change." };
  }

  const needle = canonical(text);
  if (needle.split(" ").filter(Boolean).length < MIN_QUOTE_WORDS) {
    return {
      quote: text,
      status: "too_short",
      message: "Quote is too short to verify against the source.",
    };
  }

  const beforeText = canonical(change.before?.text || "");
  const afterText = canonical(change.after?.text || "");

  if (afterText.includes(needle)) {
    return { quote: text, status: "verified", source: "after", message: "Found verbatim in the new version." };
  }
  if (beforeText.includes(needle)) {
    return { quote: text, status: "verified", source: "before", message: "Found verbatim in the old version." };
  }

  return {
    quote: text,
    status: "unverified",
    message:
      "This wording does not appear in either version of the clause. Treat it as the model paraphrasing, not quoting.",
  };
}

/**
 * Check a whole set of explanations.
 * Also enforces that the model only ever spoke about changes the diff engine
 * actually found — an explanation for a clause that was never flagged is as
 * much a fabrication as an invented quote.
 */
export function verifyExplanations(explanations, rankedChanges) {
  const byId = new Map(rankedChanges.map((c) => [c.id, c]));
  const results = [];

  for (const explanation of explanations) {
    const change = byId.get(explanation.change_id);
    if (!change) {
      results.push({
        changeId: explanation.change_id,
        status: "orphaned",
        message: "The model described a change the diff engine never found.",
      });
      continue;
    }
    results.push({
      changeId: explanation.change_id,
      ...verifyQuote(explanation.quote, change),
    });
  }

  const problems = results.filter((r) => r.status === "unverified" || r.status === "orphaned");

  return {
    passed: problems.length === 0,
    results,
    summary: {
      checked: results.length,
      verified: results.filter((r) => r.status === "verified").length,
      problems: problems.length,
    },
  };
}
