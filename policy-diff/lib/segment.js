/**
 * Step 1 — Segmentation (deterministic).
 *
 * A policy document is not prose, it is a list of clauses, and a diff is only
 * readable if it is expressed clause by clause. Splitting is done in code:
 * asking a model to segment a document is slow, non-reproducible, and silently
 * drops text, which is the one failure a diff tool cannot survive.
 *
 * Pure functions, no imports — testable in plain Node with nothing installed.
 */

/** Numbered or lettered clause openers: "4.", "4.2", "(a)", "Section 7", "ARTICLE II". */
const HEADING_PATTERN =
  /^(?:(?:section|article|clause|§)\s+[\w.\-]+|[0-9]+(?:\.[0-9]+)*\.?|\([a-z0-9]+\)|[A-Z]{2,}[A-Z\s]{2,})\s*[:.\-–—]?\s*/i;

export function normalize(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Collapse to a comparison key: case and punctuation carry no meaning for alignment. */
export function canonical(text) {
  return normalize(text).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function tokenize(text) {
  return canonical(text).split(" ").filter(Boolean);
}

/**
 * Split a document into clauses.
 * Paragraph breaks are the primary boundary; a very long paragraph is split
 * further at sentence boundaries so one giant blob does not swallow the diff.
 */
export function segment(text, { maxWords = 120 } = {}) {
  const clean = normalize(text);
  if (!clean) return [];

  const paragraphs = clean
    .split(/\n\s*\n|\n(?=\s*(?:[0-9]+(?:\.[0-9]+)*\.?\s|\([a-z0-9]+\)\s|section\s|article\s|§))/i)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);

  const segments = [];
  for (const paragraph of paragraphs) {
    for (const piece of splitLongParagraph(paragraph, maxWords)) {
      const headingMatch = piece.match(HEADING_PATTERN);
      segments.push({
        index: segments.length,
        id: `S${segments.length}`,
        heading: headingMatch ? headingMatch[0].trim().replace(/[:.\-–—]\s*$/, "") : null,
        text: piece,
        canonical: canonical(piece),
        words: tokenize(piece).length,
      });
    }
  }
  return segments;
}

function splitLongParagraph(paragraph, maxWords) {
  if (paragraph.split(/\s+/).length <= maxWords) return [paragraph];

  const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [paragraph];
  const pieces = [];
  let current = "";
  for (const sentence of sentences) {
    const candidate = (current + " " + sentence).trim();
    if (current && candidate.split(/\s+/).length > maxWords) {
      pieces.push(current.trim());
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) pieces.push(current.trim());
  return pieces;
}
