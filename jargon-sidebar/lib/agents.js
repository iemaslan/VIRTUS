/**
 * The one model call in this pipeline.
 *
 * By the time it runs, detection has already decided which words are jargon.
 * The model is handed those words together with the sentence each was spoken
 * in, and asked the single thing code cannot do: say what the term means to
 * someone who just lost the thread of a talk.
 *
 * It is never asked what the jargon is, because that question has a checkable
 * answer and `lib/detect.js` already answered it.
 */

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

/**
 * An identity-linked API key acts as the person who created it, and the API
 * requires that such a request name the workspace it acts in. A workspace key
 * carries that context already. Supporting both means the deployment works
 * with whichever kind of key was pasted into it, and says so when it does not.
 */
export function createClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic({
    apiKey,
    ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
  });
}

const DEFINITION_SCHEMA = {
  type: "object",
  properties: {
    definitions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          term: {
            type: "string",
            description: "The term being defined, copied exactly as it was given to you.",
          },
          short: {
            type: "string",
            description:
              "One sentence, under 20 words, that would make sense to a smart person outside this field. No other jargon.",
          },
          in_context: {
            type: "string",
            description:
              "One sentence on what the speaker was using it for in this particular sentence. Not a second definition.",
          },
          category: {
            type: "string",
            enum: ["acronym", "tool", "concept", "protocol", "metric", "other"],
          },
        },
        required: ["term", "short", "in_context", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["definitions"],
  additionalProperties: false,
};

const SYSTEM = `You write the sidebar definitions for a live technical talk.

Someone in the audience just heard a term they do not know. They have about
four seconds to read you before the speaker moves on, and they cannot ask a
follow-up question.

Rules:
- Define only the terms in the list. Never add a term that is not there.
- Under 20 words for "short". A reader glancing sideways must finish it.
- Never explain jargon with more jargon. If the definition needs a second
  unfamiliar word, you have not finished the job.
- "in_context" says what the speaker was doing with the term in that sentence,
  not what the term means again.
- If the transcript is garbled and you genuinely cannot tell what a term is,
  say so plainly in "short" rather than guessing. This is a live microphone;
  mishearings are expected and an honest blank beats a confident invention.`;

function readJson(response) {
  const block = response.content.find((b) => b.type === "text");
  if (!block) throw new Error("The model returned no text content.");
  return JSON.parse(block.text);
}

export async function defineTerms(client, items) {
  const rendered = items
    .map((item) => `TERM: ${item.term}\nHEARD IN: "${item.sentence}"`)
    .join("\n\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: DEFINITION_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Define these ${items.length} term${items.length === 1 ? "" : "s"}. One entry per term, nothing else.\n\n${rendered}`,
      },
    ],
  });

  return readJson(response);
}
