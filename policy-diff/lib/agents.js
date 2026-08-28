/**
 * The one model call in this pipeline.
 *
 * By the time it runs, the diff engine has already decided what changed and the
 * impact scorer has already decided what matters. The model is handed that list
 * and asked to do the single thing code cannot: say what a clause means to a
 * person who is not a lawyer.
 *
 * It is never asked what changed, and it is never asked how much a change
 * matters, because those are questions with checkable answers.
 */

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export function createClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

const EXPLANATION_SCHEMA = {
  type: "object",
  properties: {
    document_summary: {
      type: "string",
      description:
        "Two sentences, for someone who has read neither version: what kind of document this is and the overall direction of the changes.",
    },
    explanations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          change_id: { type: "string", description: "The id of the change being explained, exactly as given." },
          headline: {
            type: "string",
            description:
              "One short line in plain English, as a person would say it out loud. No legal vocabulary. Under 12 words.",
          },
          what_it_means: {
            type: "string",
            description:
              "Two sentences addressed to the reader as 'you', explaining the practical consequence.",
          },
          who_is_affected: {
            type: "string",
            description:
              "The specific group this lands on, e.g. 'anyone applying for the first time'. Not 'all users'.",
          },
          direction: {
            type: "string",
            enum: ["worse_for_you", "better_for_you", "neutral"],
            description: "Whether this change is worse, better, or neither for the reader.",
          },
          quote: {
            type: "string",
            description:
              "A short phrase copied EXACTLY, character for character, from the clause text provided. Never reworded. This is checked against the document automatically and a mismatch is reported as unverified.",
          },
        },
        required: ["change_id", "headline", "what_it_means", "who_is_affected", "direction", "quote"],
        additionalProperties: false,
      },
    },
  },
  required: ["document_summary", "explanations"],
  additionalProperties: false,
};

const SYSTEM = `You translate legal and administrative documents for people who are not lawyers.

You are given a list of changes that were already identified by a diff engine,
each with its old and new text. Explain them.

Rules:
- Explain only the changes in the list. Do not mention a change that is not
  there, and do not merge two changes into one.
- Write the way a person speaks. "You now pay $45 to apply" beats "an
  application fee has been introduced". Never use "pursuant to", "shall", or
  "herein".
- The quote field must be copied character for character out of the clause text
  you were given. It is checked automatically against the source document and a
  mismatch is shown to the reader as unverified, so copy, never reword. If no
  short phrase captures it, quote the shortest span that does.
- who_is_affected must name a group specifically enough that a reader can tell
  whether it includes them.
- Do not soften a change that is worse for the reader, and do not dramatise one
  that is routine. Direction is a judgement about them, not about the tone of
  the writing.`;

function readJson(response) {
  const block = response.content.find((b) => b.type === "text");
  if (!block) throw new Error("The model returned no text content.");
  return JSON.parse(block.text);
}

/** Only what the model needs: ids and the two versions of the text. */
function renderChanges(rankedChanges) {
  return rankedChanges
    .map((change) => {
      const parts = [`[${change.id}] change type: ${change.type}`];
      if (change.before) parts.push(`OLD TEXT: ${change.before.text}`);
      if (change.after) parts.push(`NEW TEXT: ${change.after.text}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

export async function explainChanges(client, rankedChanges) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: EXPLANATION_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Explain each of these ${rankedChanges.length} changes. Return one explanation per change_id, and nothing else.\n\n${renderChanges(rankedChanges)}`,
      },
    ],
  });

  return readJson(response);
}
