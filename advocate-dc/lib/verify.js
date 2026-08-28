/**
 * Agent 5 — Citation verification (deterministic, no LLM).
 *
 * This is the guardrail the whole product rests on. A language model asked to
 * write a legal letter will happily invent a statute that sounds exactly like a
 * real one. So nothing the model writes is trusted: every legal citation in the
 * draft is extracted by regex and checked against the provisions that Agent 2
 * actually retrieved. A citation that is not in the source data is reported as
 * unverified, with the surrounding sentence, so a human can see precisely where
 * the draft went beyond its evidence.
 *
 * Deliberately implemented in code rather than as an LLM "fact-check" pass:
 * a second model call would be one more thing that can hallucinate. String
 * matching against a known corpus cannot.
 *
 * Pure functions, with no dependency beyond a sibling helper, so this module is
 * testable in plain Node with nothing installed.
 */

import { normalizeSection } from "./retrieval.js";

const DASHES = "\\u2010-\\u2015\\-";

/** "D.C. Code § 42-3502.17", "D.C. Official Code §§ 42-3505.01", "14 DCMR § 301", bare "§ 301". */
const SECTION_PATTERN = new RegExp(
  `(D\\.?\\s?C\\.?\\s+(?:Official\\s+)?Code|DCMR|U\\.?S\\.?C\\.?)?\\s*§{1,2}\\s*([0-9]+[A-Za-z]?(?:[${DASHES}][0-9]+[A-Za-z]?)*(?:\\.[0-9]+)*)`,
  "gi"
);

/** A statute cited without the section symbol: "D.C. Code 42-3502.17". */
const BARE_CODE_PATTERN = new RegExp(
  `(D\\.?\\s?C\\.?\\s+(?:Official\\s+)?Code)\\s+([0-9]+[A-Za-z]?(?:[${DASHES}][0-9]+[A-Za-z]?)*(?:\\.[0-9]+)*)`,
  "gi"
);

/** Provision tags the drafting agent is instructed to attach: "[DC-DEPOSIT-RETURN]". */
const TAG_PATTERN = /\[([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\]/g;

const CONTEXT_RADIUS = 70;

function normalizeFamily(rawFamily) {
  if (!rawFamily) return null;
  const family = rawFamily.toLowerCase().replace(/[.\s]/g, "");
  if (family.includes("dcmr")) return "dcmr";
  if (family.includes("usc")) return "usc";
  if (family.includes("code")) return "dccode";
  return null;
}

const FAMILY_LABELS = {
  dccode: "D.C. Code",
  dcmr: "DCMR",
  usc: "U.S. Code",
};

function contextAround(text, index, length) {
  const start = Math.max(0, index - CONTEXT_RADIUS);
  const end = Math.min(text.length, index + length + CONTEXT_RADIUS);
  return (
    (start > 0 ? "…" : "") +
    text.slice(start, end).replace(/\s+/g, " ").trim() +
    (end < text.length ? "…" : "")
  );
}

/** Every statute-shaped string in the draft, with where it appeared. */
export function extractCitations(text) {
  const found = [];
  const seen = new Set();

  for (const pattern of [SECTION_PATTERN, BARE_CODE_PATTERN]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[0].trim();
      const key = `${match.index}:${raw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({
        raw,
        family: normalizeFamily(match[1]),
        section: match[2],
        index: match.index,
        context: contextAround(text, match.index, match[0].length),
      });
    }
  }

  // Overlapping matches (the bare-code pattern can re-find a §-prefixed hit):
  // keep one entry per normalized section per position span.
  return found
    .sort((a, b) => a.index - b.index)
    .filter((citation, i, all) =>
      all.findIndex(
        (other) =>
          normalizeSection(other.section) === normalizeSection(citation.section) &&
          Math.abs(other.index - citation.index) < 30
      ) === i
    );
}

/** Every "[PROVISION-ID]" tag in the draft. */
export function extractTags(text) {
  TAG_PATTERN.lastIndex = 0;
  const tags = [];
  let match;
  while ((match = TAG_PATTERN.exec(text)) !== null) {
    tags.push({ id: match[1], index: match.index });
  }
  return tags;
}

/**
 * Check a draft against the provisions it was allowed to use.
 *
 * @param {string} draft            the letter text produced by Agent 4
 * @param {Array}  provisions       the provisions Agent 2 retrieved
 * @returns {{passed: boolean, citations: Array, tags: Array, summary: object}}
 */
export function verifyDraft(draft, provisions) {
  const text = draft || "";

  const allowedSections = new Map();
  for (const provision of provisions) {
    for (const citation of provision.citations || []) {
      const key = normalizeSection(citation.section);
      if (!allowedSections.has(key)) {
        allowedSections.set(key, {
          family: citation.family,
          authority: provision.authority,
          provisionIds: [],
        });
      }
      allowedSections.get(key).provisionIds.push(provision.id);
    }
  }

  const provisionsById = new Map(provisions.map((p) => [p.id, p]));

  const citations = extractCitations(text).map((citation) => {
    const key = normalizeSection(citation.section);
    const allowed = allowedSections.get(key);

    if (!allowed) {
      return {
        ...citation,
        status: "unverified",
        message:
          "This citation does not appear anywhere in the retrieved source data. Treat it as fabricated until a human confirms it.",
      };
    }
    if (citation.family && citation.family !== allowed.family) {
      return {
        ...citation,
        status: "wrong_authority",
        expectedAuthority: allowed.authority,
        provisionIds: allowed.provisionIds,
        message: `Section ${citation.section} exists in the source data, but under ${
          FAMILY_LABELS[allowed.family] || allowed.family
        }, not ${FAMILY_LABELS[citation.family] || citation.family}.`,
      };
    }
    return {
      ...citation,
      status: "verified",
      authority: allowed.authority,
      provisionIds: allowed.provisionIds,
      message: `Matches ${allowed.authority} in the source data.`,
    };
  });

  const tags = extractTags(text).map((tag) => {
    const provision = provisionsById.get(tag.id);
    return provision
      ? {
          ...tag,
          status: "verified",
          title: provision.title,
          authority: provision.authority,
          sourceUrl: provision.source_url,
        }
      : {
          ...tag,
          status: "unverified",
          message:
            "No provision with this identifier was retrieved for this case.",
        };
  });

  const problems = [
    ...citations.filter((c) => c.status !== "verified"),
    ...tags.filter((t) => t.status !== "verified"),
  ];

  const usedProvisionIds = new Set(
    tags.filter((t) => t.status === "verified").map((t) => t.id)
  );

  return {
    passed: problems.length === 0,
    citations,
    tags,
    summary: {
      citationsChecked: citations.length,
      citationsVerified: citations.filter((c) => c.status === "verified").length,
      tagsChecked: tags.length,
      tagsVerified: tags.filter((t) => t.status === "verified").length,
      problemCount: problems.length,
      provisionsAvailable: provisions.length,
      provisionsCited: usedProvisionIds.size,
    },
  };
}
