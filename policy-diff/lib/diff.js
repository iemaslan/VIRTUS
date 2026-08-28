/**
 * Step 2 — Alignment and diff (deterministic).
 *
 * This is the part a language model must not do. Asked to "diff these two
 * documents", a model will paraphrase, merge, silently skip clauses, and
 * occasionally report a change that is not there. A diff that misses a clause
 * is worse than no diff at all, because the reader now believes nothing changed.
 *
 * So the diff is computed here, in code, and the model is only ever handed the
 * changes this file already found.
 *
 * Pure functions, with no dependency beyond a sibling helper — testable in
 * plain Node with nothing installed.
 */

import { tokenize } from "./segment.js";

/** Below this token overlap, two clauses are different clauses, not an edit. */
const MATCH_THRESHOLD = 0.4;

/** Token overlap, 0 to 1. Jaccard: cheap, symmetric, and good enough for clauses. */
export function similarity(a, b) {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/**
 * Word-level diff of two clauses, via longest common subsequence.
 * Returns a token stream the interface can render as inline insertions and
 * deletions, plus the counts that feed the impact score.
 */
export function wordDiff(before, after) {
  const a = String(before).split(/(\s+)/).filter((t) => t !== "");
  const b = String(after).split(/(\s+)/).filter((t) => t !== "");

  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

  // LCS table over tokens.
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] =
        norm(a[i]) === norm(b[j])
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const parts = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;

  const push = (type, value) => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.value += value;
    else parts.push({ type, value });
  };

  while (i < a.length && j < b.length) {
    if (norm(a[i]) === norm(b[j])) {
      push("same", a[i]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      if (a[i].trim()) removed++;
      push("removed", a[i]);
      i++;
    } else {
      if (b[j].trim()) added++;
      push("added", b[j]);
      j++;
    }
  }
  while (i < a.length) {
    if (a[i].trim()) removed++;
    push("removed", a[i++]);
  }
  while (j < b.length) {
    if (b[j].trim()) added++;
    push("added", b[j++]);
  }

  return { parts, wordsAdded: added, wordsRemoved: removed };
}

/**
 * Align two segmented documents and classify every clause.
 *
 * Three passes, cheapest first:
 *   1. identical text  -> unchanged (and moved, if the position shifted)
 *   2. best remaining match above threshold -> modified
 *   3. whatever is left -> added (only in v2) or removed (only in v1)
 *
 * Every clause on both sides ends up in exactly one bucket. That invariant is
 * what makes the result trustworthy, and it is asserted in the tests.
 */
export function alignDocuments(beforeSegments, afterSegments) {
  const usedBefore = new Set();
  const usedAfter = new Set();
  const changes = [];

  // Pass 1 — exact matches.
  const byCanonical = new Map();
  for (const seg of beforeSegments) {
    if (!byCanonical.has(seg.canonical)) byCanonical.set(seg.canonical, []);
    byCanonical.get(seg.canonical).push(seg);
  }
  for (const after of afterSegments) {
    const candidates = byCanonical.get(after.canonical);
    const match = candidates?.find((c) => !usedBefore.has(c.index));
    if (!match) continue;
    usedBefore.add(match.index);
    usedAfter.add(after.index);
    changes.push({
      type: match.index === after.index ? "unchanged" : "moved",
      before: match,
      after,
      similarity: 1,
      diff: null,
    });
  }

  // Pass 2 — modified clauses, best match first so strong pairs win.
  const pending = [];
  for (const after of afterSegments) {
    if (usedAfter.has(after.index)) continue;
    for (const before of beforeSegments) {
      if (usedBefore.has(before.index)) continue;
      const score = similarity(before.text, after.text);
      if (score >= MATCH_THRESHOLD) pending.push({ before, after, score });
    }
  }
  pending.sort((x, y) => y.score - x.score);
  for (const { before, after, score } of pending) {
    if (usedBefore.has(before.index) || usedAfter.has(after.index)) continue;
    usedBefore.add(before.index);
    usedAfter.add(after.index);
    changes.push({
      type: "modified",
      before,
      after,
      similarity: Math.round(score * 100) / 100,
      diff: wordDiff(before.text, after.text),
    });
  }

  // Pass 3 — everything unpaired.
  for (const after of afterSegments) {
    if (usedAfter.has(after.index)) continue;
    changes.push({ type: "added", before: null, after, similarity: 0, diff: null });
  }
  for (const before of beforeSegments) {
    if (usedBefore.has(before.index)) continue;
    changes.push({ type: "removed", before, after: null, similarity: 0, diff: null });
  }

  changes.sort((a, b) => position(a) - position(b));
  changes.forEach((change, i) => {
    change.id = `C${i}`;
  });

  return {
    changes,
    summary: {
      clausesBefore: beforeSegments.length,
      clausesAfter: afterSegments.length,
      unchanged: changes.filter((c) => c.type === "unchanged").length,
      moved: changes.filter((c) => c.type === "moved").length,
      modified: changes.filter((c) => c.type === "modified").length,
      added: changes.filter((c) => c.type === "added").length,
      removed: changes.filter((c) => c.type === "removed").length,
    },
  };
}

function position(change) {
  return change.after ? change.after.index : (change.before?.index ?? 0) + 0.5;
}

/** The clauses actually worth a reader's attention. */
export function substantiveChanges(changes) {
  return changes.filter((c) => c.type !== "unchanged");
}
