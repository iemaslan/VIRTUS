/**
 * The three agents that require judgment, and only those three.
 *
 * Agent 1 (classify) and Agent 3 (strategy) are model calls constrained by a
 * JSON schema. Agent 4 (draft) is a streaming model call whose entire universe
 * of legal authority is the provisions handed to it by Agent 2.
 *
 * Agents 2 and 5 — retrieving the law and verifying the citations — are code,
 * in `retrieval.js` and `verify.js`. That split is the design: the model is
 * used where language and judgment are needed, and never where correctness is.
 */

import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "./retrieval.js";
import { TRIGGER_KINDS } from "./deadlines.js";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export const STRATEGY_PATHS = [
  "demand_letter",
  "ota_complaint",
  "tenant_petition",
  "small_claims",
  "emergency_help",
];

/**
 * Returns null when nothing is configured, which puts the app into demo mode.
 *
 * Two ways to run against a real model:
 *   ANTHROPIC_API_KEY          — the Anthropic API directly. The default.
 *   ANTHROPIC_VERTEX_PROJECT_ID — Claude on Google Cloud Vertex AI, billed to a
 *     GCP project. Useful if you are spending Google Cloud credits rather than
 *     Anthropic ones. Auth comes from application default credentials
 *     (`gcloud auth application-default login`), not from an API key, and the
 *     model IDs are identical. Structured outputs and effort are both GA on
 *     Vertex, so nothing else in this codebase changes.
 *
 * The Vertex SDK is imported dynamically, and marked webpackIgnore so the
 * bundler leaves it alone, keeping it a genuinely optional dependency: nobody
 * running on the Anthropic API needs it installed.
 */
export async function createClient() {
  const vertexProject = process.env.ANTHROPIC_VERTEX_PROJECT_ID;
  if (vertexProject) {
    // webpackIgnore keeps this a genuine runtime import: without it the bundler
    // resolves the specifier at build time and the build fails for everyone who
    // has not installed an SDK they do not use.
    const { AnthropicVertex } = await import(
      /* webpackIgnore: true */ "@anthropic-ai/vertex-sdk"
    ).catch(() => {
      throw new Error(
        "ANTHROPIC_VERTEX_PROJECT_ID is set but @anthropic-ai/vertex-sdk is not installed. Run: npm install @anthropic-ai/vertex-sdk"
      );
    });
    return new AnthropicVertex({
      projectId: vertexProject,
      region: process.env.ANTHROPIC_VERTEX_REGION || "global",
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

/** Read the single text block a schema-constrained response is guaranteed to produce. */
function readJson(response) {
  const block = response.content.find((b) => b.type === "text");
  if (!block) throw new Error("The model returned no text content.");
  return JSON.parse(block.text);
}

// ---------------------------------------------------------------------------
// Agent 1 — Intake and classification
// ---------------------------------------------------------------------------

const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: CATEGORIES },
    severity: { type: "string", enum: ["low", "medium", "high"] },
    summary: {
      type: "string",
      description: "One neutral sentence restating the tenant's situation.",
    },
    key_facts: {
      type: "array",
      items: { type: "string" },
      description:
        "The facts a decision-maker would need, taken only from what the tenant wrote. No inferences.",
    },
    trigger_date: {
      type: ["string", "null"],
      description:
        "ISO 8601 date (YYYY-MM-DD) that starts the relevant legal clock, if the tenant gave one. Null if they did not.",
    },
    trigger_kind: { type: "string", enum: TRIGGER_KINDS },
    money_at_stake: {
      type: ["number", "null"],
      description: "Dollar amount in dispute if the tenant named one, otherwise null.",
    },
    evidence_mentioned: {
      type: "array",
      items: { type: "string" },
      description: "Documentation the tenant says they already have.",
    },
    missing_information: {
      type: "array",
      items: { type: "string" },
      description:
        "Up to three specific things the tenant should find out or write down to make their case stronger.",
    },
  },
  required: [
    "category",
    "severity",
    "summary",
    "key_facts",
    "trigger_date",
    "trigger_kind",
    "money_at_stake",
    "evidence_mentioned",
    "missing_information",
  ],
  additionalProperties: false,
};

const CLASSIFY_SYSTEM = `You are the intake agent of a Washington, DC tenant-rights assistant.

Read what a tenant wrote about their housing problem and turn it into structured
intake data for the rest of the pipeline.

Rules:
- Extract only what the tenant actually said. Never infer a date, a dollar
  amount, or a fact they did not state; use null or an empty list instead.
- today's date is provided in the message. Resolve relative dates ("two months
  ago") against it, and only when the tenant's wording makes the date certain.
- trigger_kind names the event that starts the legal clock in this kind of case:
  the tenancy ending, a withholding notice, a complaint or repair request the
  tenant made, a previous rent increase, a rent-increase notice, or the day the
  problem began. Use "none" when no clock is running.
- severity is "high" when housing, safety, or a legal deadline is immediately at
  risk; "low" when nothing is time-critical.`;

export async function classifyIssue(client, description, today) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: CLASSIFY_SYSTEM,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: CLASSIFICATION_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Today's date is ${today}.\n\nThe tenant wrote:\n\n${description}`,
      },
    ],
  });

  return readJson(response);
}

// ---------------------------------------------------------------------------
// Agent 3 — Strategy
// ---------------------------------------------------------------------------

const STRATEGY_SCHEMA = {
  type: "object",
  properties: {
    path: { type: "string", enum: STRATEGY_PATHS },
    reasoning: {
      type: "string",
      description:
        "Two or three sentences, addressed to the tenant, explaining why this route fits their situation.",
    },
    what_to_ask_for: {
      type: "string",
      description: "The concrete remedy the tenant should demand, in one sentence.",
    },
    response_window_days: {
      type: "integer",
      description: "How many days the letter should give the other side to respond. 7 to 30.",
    },
    escalation: {
      type: "string",
      description: "One sentence on what the tenant does next if that window passes with no response.",
    },
  },
  required: ["path", "reasoning", "what_to_ask_for", "response_window_days", "escalation"],
  additionalProperties: false,
};

const STRATEGY_SYSTEM = `You are the strategy agent of a Washington, DC tenant-rights assistant.

Given structured intake data and the DC provisions that were retrieved for the
case, choose the single route that gives this tenant the best outcome for the
least cost and risk.

The routes:
- demand_letter: a written demand to the housing provider. The right first step
  in most disputes, and a prerequisite that strengthens every later step.
- ota_complaint: a complaint to the DC Office of the Tenant Advocate. Use when
  the tenant needs an agency behind them, or does not know where to file.
- tenant_petition: a petition to the Rental Accommodations Division. The correct
  venue for unlawful rent increases and rent-control violations.
- small_claims: DC Superior Court, Small Claims Branch, for money claims up to
  $10,000. Appropriate for a deposit the housing provider has refused to return
  after a written demand.
- emergency_help: the situation is urgent — an illegal lockout, utilities cut
  off, an imminent eviction, or a habitability failure that makes the unit
  dangerous. The tenant needs help today, not a letter.

Escalating too early costs the tenant time and money. Escalating too late costs
them the deadline. Pick for this tenant, not for the average one.`;

export async function chooseStrategy(client, { classification, provisions, deadlines }) {
  const provisionSummary = provisions
    .map((p) => `- [${p.id}] ${p.title} (${p.authority})`)
    .join("\n");

  const deadlineSummary = deadlines.length
    ? deadlines
        .map((d) => `- ${d.title}: due ${d.dueDate}, ${d.note}`)
        .join("\n")
    : "- No statutory clock could be computed from the facts given.";

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: STRATEGY_SYSTEM,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: STRATEGY_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Intake data:
${JSON.stringify(classification, null, 2)}

Provisions retrieved for this case:
${provisionSummary}

Statutory clocks computed from the tenant's dates:
${deadlineSummary}`,
      },
    ],
  });

  return readJson(response);
}

// ---------------------------------------------------------------------------
// Agent 4 — Drafting
// ---------------------------------------------------------------------------

const DRAFT_SYSTEM = `You are the drafting agent of a Washington, DC tenant-rights assistant.
You write the letter the tenant will actually send.

THE ONLY LEGAL AUTHORITY YOU HAVE is the list of provisions in the user message.
- Never cite a statute, regulation, or case that is not in that list. Not one.
  A citation you invent will be caught by an automated verifier and the draft
  will be rejected, so if you are unsure a point is supported, leave it out.
- Cite in two ways at once: write the authority in prose the way a lawyer would
  ("D.C. Code § 42-3502.17"), and immediately follow the sentence with the
  provision's identifier in square brackets ("[DC-DEPOSIT-RETURN]").
- The bracketed identifiers stay in the letter. They are how the tenant, and the
  verifier, can trace every claim back to its source.

How to write it:
- Formal business letter, addressed to the housing provider unless the strategy
  says the letter goes to an agency. Firm, specific, unemotional. No threats,
  no rhetoric, no adjectives doing work that facts should do.
- State the facts in dated order, then the legal basis, then the specific ask,
  then the response window, then what happens if that window passes.
- Use only facts from the intake data. If something is unknown, leave a square
  bracket placeholder: [TENANT NAME], [PROPERTY ADDRESS], [HOUSING PROVIDER NAME],
  [DATE], [DEPOSIT AMOUNT]. Never invent a name, address, date, or amount.
- Keep it under 400 words. A short letter with three sourced citations is more
  effective than a long one.
- Output the letter text only — no preamble, no explanation, no markdown headers.
- Do not include a legal disclaimer; the application shows one separately.`;

function buildDraftPrompt({ classification, strategy, provisions, deadlines, tenant, today }) {
  const provisionBlock = provisions
    .map(
      (p) =>
        `[${p.id}] ${p.title}\n  Authority: ${p.authority}\n  Says: ${p.summary}`
    )
    .join("\n\n");

  const deadlineBlock = deadlines.length
    ? deadlines.map((d) => `- ${d.title}: deadline ${d.dueDate} (${d.note})`).join("\n")
    : "- None computed.";

  return `Today's date: ${today}

Tenant details (use these; anything blank stays a placeholder):
- Name: ${tenant.name || "[TENANT NAME]"}
- Property address: ${tenant.address || "[PROPERTY ADDRESS]"}
- Housing provider: ${tenant.landlord || "[HOUSING PROVIDER NAME]"}

Intake data:
${JSON.stringify(classification, null, 2)}

Chosen strategy: ${strategy.path}
What to ask for: ${strategy.what_to_ask_for}
Response window: ${strategy.response_window_days} days
If ignored: ${strategy.escalation}

Statutory deadlines already computed (use these numbers exactly; do not recompute):
${deadlineBlock}

THE COMPLETE LIST OF LEGAL AUTHORITY YOU MAY CITE:

${provisionBlock}

Write the letter.`;
}

/**
 * Streams the draft. Yields text chunks as they arrive, so the pipeline can show
 * the letter being written rather than making the user wait on a spinner.
 */
export async function* draftLetter(client, input) {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 4000,
    system: DRAFT_SYSTEM,
    output_config: { effort: "medium" },
    messages: [{ role: "user", content: buildDraftPrompt(input) }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}
