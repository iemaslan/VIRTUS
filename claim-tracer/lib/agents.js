/**
 * The two model calls.
 *
 * The first splits a post into atomic claims, which is a language task. The
 * second runs a web search per claim — and the important detail is what happens
 * to the result: the URLs are read out of the search tool's own structured
 * result blocks, never out of the model's prose.
 *
 * That is a structural guarantee rather than a hope. A model cannot invent a
 * source that reaches the verdict, because the verdict is computed in code from
 * the list the search engine returned.
 */

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export function createClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

// ---------------------------------------------------------------------------
// Step 1 — Claim extraction
// ---------------------------------------------------------------------------

const CLAIMS_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description:
              "One atomic claim, rewritten as a standalone sentence that stands on its own without the surrounding post.",
          },
          quote: {
            type: "string",
            description: "The span of the original post this claim came from, copied exactly.",
          },
        },
        required: ["text", "quote"],
        additionalProperties: false,
      },
    },
  },
  required: ["claims"],
  additionalProperties: false,
};

const EXTRACT_SYSTEM = `You split text into atomic factual claims.

An atomic claim asserts exactly one thing. "Crime fell 20 percent and the mayor
took credit" is two claims, not one.

Rules:
- Rewrite each claim so it stands alone. A reader who has not seen the post must
  be able to understand what is being asserted.
- Include claims of every kind — factual, opinion, prediction, rumour. Deciding
  which are checkable happens later, in code, and it needs to see all of them.
- The quote field is copied exactly from the input. Never reword it.
- Do not add claims the text does not make, and do not editorialise. If the post
  makes three claims, return three.
- Cap at 10 claims. If there are more, return the 10 that carry the most weight.`;

function readJson(response) {
  const block = response.content.find((b) => b.type === "text");
  if (!block) throw new Error("The model returned no text content.");
  return JSON.parse(block.text);
}

export async function extractClaims(client, text) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: EXTRACT_SYSTEM,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: CLAIMS_SCHEMA },
    },
    messages: [{ role: "user", content: `Split this into atomic claims:\n\n${text}` }],
  });

  return readJson(response).claims;
}

// ---------------------------------------------------------------------------
// Step 3 — Search
// ---------------------------------------------------------------------------

const SEARCH_SYSTEM = `You are tracing one factual claim back to its origin.

Search for the most authoritative source that speaks to the claim — the agency
that published the figure, the court that issued the ruling, the study itself.
Prefer the origin over anyone reporting on it.

Then write two sentences on what the sources actually say, and whether they
support the claim, contradict it, or address something adjacent to it. Say so
plainly when the sources do not settle the question.

Do not write URLs in your text. The sources are collected automatically from
the search results, and anything you type as a link is discarded.`;

/** Read the URLs out of the search tool's own result blocks. */
function collectSearchResults(content) {
  const results = [];
  for (const block of content) {
    if (block.type !== "web_search_tool_result") continue;
    // A successful result carries a list; an error carries an object.
    if (!Array.isArray(block.content)) continue;
    for (const item of block.content) {
      if (item?.url) results.push({ url: item.url, title: item.title || item.url });
    }
  }
  return results;
}

function collectText(content) {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
}

/**
 * Search for one claim. Handles `pause_turn`, which the server-side search tool
 * uses to hand a long-running turn back before continuing.
 */
export async function searchClaim(client, claim, query) {
  const messages = [
    {
      role: "user",
      content: `Claim to trace: ${claim}\n\nSearch for: ${query}`,
    },
  ];

  let results = [];
  let summary = "";

  for (let turn = 0; turn < 3; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SEARCH_SYSTEM,
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
      messages,
    });

    results = results.concat(collectSearchResults(response.content));
    summary = collectText(response.content) || summary;

    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }

  // Deduplicate by URL, keeping first appearance.
  const seen = new Set();
  const unique = results.filter((r) => !seen.has(r.url) && seen.add(r.url));

  return { results: unique, summary };
}
