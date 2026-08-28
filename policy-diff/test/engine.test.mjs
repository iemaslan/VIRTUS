/**
 * The diff engine is the product. If it silently drops a clause, the reader is
 * told nothing changed when something did — the single failure this tool cannot
 * survive. So the invariants are tested, not assumed.
 *
 *   npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { segment, canonical, normalize } from "../lib/segment.js";
import { alignDocuments, wordDiff, similarity } from "../lib/diff.js";
import { rankChanges, scoreChange, detectSignals, severityBand } from "../lib/impact.js";
import { verifyQuote, verifyExplanations } from "../lib/verify.js";
import { SAMPLE_BEFORE, SAMPLE_AFTER } from "../data/samples.js";

const before = segment(SAMPLE_BEFORE);
const after = segment(SAMPLE_AFTER);
const { changes, summary } = alignDocuments(before, after);

test("segmentation splits a policy into clauses and keeps the text", () => {
  assert.ok(before.length >= 7, `expected at least 7 clauses, got ${before.length}`);
  const rejoined = canonical(before.map((s) => s.text).join(" "));
  for (const phrase of ["annual income", "application fee", "independent review panel"]) {
    assert.ok(rejoined.includes(canonical(phrase)), `segmentation lost: ${phrase}`);
  }
});

test("every clause on both sides lands in exactly one bucket", () => {
  const beforeSeen = changes.filter((c) => c.before).map((c) => c.before.index);
  const afterSeen = changes.filter((c) => c.after).map((c) => c.after.index);

  assert.equal(new Set(beforeSeen).size, beforeSeen.length, "a clause was matched twice");
  assert.equal(new Set(afterSeen).size, afterSeen.length, "a clause was matched twice");
  assert.equal(beforeSeen.length, before.length, "a clause from the old version was dropped");
  assert.equal(afterSeen.length, after.length, "a clause from the new version was dropped");
});

test("an untouched clause is reported as unchanged", () => {
  const payment = changes.find((c) => c.after?.text.includes("10 business days"));
  assert.equal(payment.type, "unchanged");
  assert.ok(summary.unchanged >= 1);
});

test("a rewritten clause is reported as modified, not as add plus remove", () => {
  const eligibility = changes.find((c) => c.after?.text.includes("60 percent"));
  assert.equal(eligibility.type, "modified");
  assert.ok(eligibility.similarity > 0.4);
  assert.ok(eligibility.diff.wordsAdded > 0 && eligibility.diff.wordsRemoved > 0);
});

test("word diff marks the numbers that actually changed", () => {
  const { parts } = wordDiff("at least 30 days written notice", "at least 10 days written notice");
  const removed = parts.filter((p) => p.type === "removed").map((p) => p.value).join("");
  const added = parts.filter((p) => p.type === "added").map((p) => p.value).join("");
  assert.match(removed, /30/);
  assert.match(added, /10/);
  assert.ok(parts.some((p) => p.type === "same" && p.value.includes("written")));
});

test("similarity separates an edit from a different clause", () => {
  assert.ok(similarity("the fee is $10", "the fee is $45") > 0.5);
  assert.ok(similarity("the fee is $10", "payments are issued to the landlord") < 0.2);
});

test("impact scoring flags money, rights, deadlines, and data", () => {
  assert.ok(detectSignals("a non-refundable application fee of $45 is charged").some((s) => s.id === "money"));
  assert.ok(detectSignals("participants waive the right to a class action").some((s) => s.id === "dispute"));
  assert.ok(detectSignals("at least 10 days written notice").some((s) => s.id === "deadline"));
  assert.ok(detectSignals("may be shared with third party service providers").some((s) => s.id === "data"));
});

test("the arbitration clause and the fee outrank a cosmetic edit", () => {
  const ranked = rankChanges(changes);
  const top = ranked.slice(0, 4).map((c) => (c.after || c.before).text.toLowerCase());

  assert.ok(top.some((t) => t.includes("arbitration")), "arbitration should rank near the top");
  assert.ok(top.some((t) => t.includes("fee")), "the new fee should rank near the top");
  assert.ok(ranked[0].impact.score > ranked[ranked.length - 1].impact.score);
});

test("ranking is stable and every score comes with its reasons", () => {
  const first = rankChanges(changes).map((c) => c.id);
  const second = rankChanges(changes).map((c) => c.id);
  assert.deepEqual(first, second);

  for (const change of rankChanges(changes)) {
    assert.ok(change.impact.score >= 0 && change.impact.score <= 100);
    assert.ok(change.impact.reasons.length > 0, `no reasons given for ${change.id}`);
    assert.ok(["high", "medium", "low"].includes(severityBand(change.impact.score)));
  }
});

test("unchanged clauses never reach the ranking", () => {
  assert.ok(rankChanges(changes).every((c) => c.type !== "unchanged"));
});

test("a quote that is really in the clause verifies", () => {
  const arbitration = changes.find((c) => c.after?.text.includes("arbitration"));
  const result = verifyQuote("resolved by binding arbitration", arbitration);
  assert.equal(result.status, "verified");
  assert.equal(result.source, "after");
});

test("a plausible but invented quote is caught", () => {
  const arbitration = changes.find((c) => c.after?.text.includes("arbitration"));
  const result = verifyQuote("participants forfeit all legal remedies whatsoever", arbitration);
  assert.equal(result.status, "unverified");
  assert.match(result.message, /does not appear/);
});

test("quoting the old version is verified and attributed to the old version", () => {
  const notice = changes.find((c) => c.after?.text.includes("10 days written notice"));
  const result = verifyQuote("at least 30 days written notice", notice);
  assert.equal(result.status, "verified");
  assert.equal(result.source, "before");
});

test("an explanation for a change that was never found is rejected", () => {
  const ranked = rankChanges(changes);
  const report = verifyExplanations(
    [{ change_id: "C999", quote: "anything at all here" }],
    ranked
  );
  assert.equal(report.passed, false);
  assert.equal(report.results[0].status, "orphaned");
});

test("a clean set of explanations passes", () => {
  const ranked = rankChanges(changes);
  const report = verifyExplanations(
    ranked.slice(0, 3).map((c) => ({
      change_id: c.id,
      quote: (c.after || c.before).text.split(" ").slice(0, 8).join(" "),
    })),
    ranked
  );
  assert.equal(report.passed, true);
  assert.equal(report.summary.verified, 3);
});

test("identical documents produce no substantive changes", () => {
  const same = alignDocuments(segment(SAMPLE_BEFORE), segment(SAMPLE_BEFORE));
  assert.equal(same.summary.modified, 0);
  assert.equal(same.summary.added, 0);
  assert.equal(same.summary.removed, 0);
  assert.equal(rankChanges(same.changes).length, 0);
});

test("empty input does not throw", () => {
  assert.deepEqual(segment(""), []);
  const empty = alignDocuments([], segment(SAMPLE_AFTER));
  assert.equal(empty.summary.added, after.length);
  assert.equal(normalize(null), "");
});
