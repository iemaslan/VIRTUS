/**
 * Agent 2 — Legal grounding (deterministic, no LLM).
 *
 * Selecting which law applies is a retrieval problem, not a judgment call, so it
 * runs in code against a curated corpus. The model never gets to decide which
 * statute exists; it only gets to write about the provisions handed to it.
 *
 * Pure functions only — no imports, so this module is testable in plain Node.
 */

export const CATEGORIES = [
  "security_deposit",
  "repair_habitability",
  "retaliation",
  "illegal_rent_increase",
  "eviction",
  "other",
];

/** Provisions that are useful in every single case, regardless of category. */
const PINNED_IDS = ["DC-OTA-CONTACT"];

const CATEGORY_MATCH_SCORE = 10;
const KEYWORD_MATCH_SCORE = 3;
const PINNED_SCORE = -1; // sorts last, but always present

/**
 * Score one provision against the tenant's own words.
 * Category match dominates; keyword hits break ties and surface provisions
 * that belong to a different category but are clearly on point.
 */
export function scoreProvision(entry, { category, text }) {
  let score = 0;
  if (category && entry.categories.includes(category)) {
    score += CATEGORY_MATCH_SCORE;
  }
  const haystack = (text || "").toLowerCase();
  for (const keyword of entry.keywords || []) {
    if (haystack.includes(keyword.toLowerCase())) {
      score += KEYWORD_MATCH_SCORE;
    }
  }
  return score;
}

/**
 * Pick the provisions the drafting agent is allowed to rely on.
 * Returns them ordered by relevance, with the pinned provisions appended.
 */
export function selectProvisions(corpus, { category, text, limit = 6 } = {}) {
  const pinned = corpus.filter((entry) => PINNED_IDS.includes(entry.id));

  const scored = corpus
    .filter((entry) => !PINNED_IDS.includes(entry.id))
    .map((entry) => ({ entry, score: scoreProvision(entry, { category, text }) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, limit);

  return [
    ...scored.map(({ entry, score }) => ({ ...entry, relevance: score })),
    ...pinned.map((entry) => ({ ...entry, relevance: PINNED_SCORE })),
  ];
}

/**
 * The set of citations the letter is permitted to contain, derived from the
 * provisions actually retrieved. This is the allowlist the verifier enforces.
 */
export function allowedCitations(provisions) {
  const allowed = new Map();
  for (const provision of provisions) {
    for (const citation of provision.citations || []) {
      const key = normalizeSection(citation.section);
      if (!allowed.has(key)) {
        allowed.set(key, {
          section: citation.section,
          family: citation.family,
          provisionIds: [],
          authority: provision.authority,
        });
      }
      allowed.get(key).provisionIds.push(provision.id);
    }
  }
  return allowed;
}

/** "§ 42-3502.17." and "42–3502.17" both normalize to "42-3502.17". */
export function normalizeSection(section) {
  return String(section)
    .replace(/[‐-―]/g, "-") // unicode dashes -> hyphen
    .replace(/[§\s]/g, "")
    .replace(/[.,;:]+$/, "")
    .toLowerCase();
}
