/**
 * The two model calls in the home-finding pipeline.
 *
 * Everything numeric — filtering, commute times, monthly cost, negotiating
 * leverage — is computed in code before either of these runs. The model reads
 * those results and does the two things it is actually better at than code:
 * turning a messy description of a life into a structured profile, and writing
 * to a human being.
 */

import { MODEL } from "../agents.js";

const HUB_KEYS = [
  "downtown",
  "dupont",
  "foggy_bottom",
  "capitol_hill",
  "navy_yard",
  "bethesda",
  "pentagon_city",
  "howard",
];

const LIFESTYLE_KEYS = [
  "running",
  "dog",
  "coffee",
  "nightlife",
  "fitness",
  "quiet",
  "outdoors",
];

function readJson(response) {
  const block = response.content.find((b) => b.type === "text");
  if (!block) throw new Error("The model returned no text content.");
  return JSON.parse(block.text);
}

// ---------------------------------------------------------------------------
// Agent H1 — Profile
// ---------------------------------------------------------------------------

const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description: "One sentence describing this renter the way a good agent would introduce them.",
    },
    max_budget: { type: "integer", description: "Monthly housing ceiling in dollars." },
    budget_basis: {
      type: "string",
      enum: ["all_in", "rent_only"],
      description: "Whether the ceiling covers everything or just rent.",
    },
    bedrooms_min: { type: "integer" },
    work_location: { type: ["string", "null"], enum: [...HUB_KEYS, null] },
    work_label: { type: ["string", "null"] },
    max_commute_minutes: { type: "integer" },
    has_dog: { type: "boolean" },
    dog_weight_lbs: { type: ["integer", "null"] },
    has_cat: { type: "boolean" },
    has_car: { type: "boolean" },
    needs_parking: { type: "boolean" },
    needs_in_unit_laundry: { type: "boolean" },
    lifestyle: {
      type: "array",
      items: { type: "string", enum: LIFESTYLE_KEYS },
      description: "What this person actually does with their week. Only what the evidence supports.",
    },
    non_negotiables: {
      type: "array",
      items: { type: "string" },
      description: "Plain-English statements of what cannot be compromised.",
    },
    assumptions: {
      type: "array",
      items: { type: "string" },
      description: "Anything inferred rather than stated, so the user can correct it.",
    },
  },
  required: [
    "headline",
    "max_budget",
    "budget_basis",
    "bedrooms_min",
    "work_location",
    "work_label",
    "max_commute_minutes",
    "has_dog",
    "dog_weight_lbs",
    "has_cat",
    "has_car",
    "needs_parking",
    "needs_in_unit_laundry",
    "lifestyle",
    "non_negotiables",
    "assumptions",
  ],
  additionalProperties: false,
};

const PROFILE_SYSTEM = `You are the profiling agent of a Washington, DC housing assistant.

You are given signals from connected accounts and whatever the person typed
themselves, and you produce the structured profile the matching engine runs on.

Rules:
- The typed description always outranks a connected-account signal. If someone
  writes "I have a car now", that beats an inferred no-car signal.
- Do not invent constraints. If nothing indicates in-unit laundry matters, it
  does not matter.
- Every inference that is not directly stated goes in "assumptions", so the user
  can see and correct it. A profile the user cannot audit is a profile they
  cannot trust.
- max_commute_minutes: default to 30 for a daily commute, 40 for hybrid work,
  and stretch it only if the person says distance is not an issue.
- Budgets are ceilings, not targets. If someone says "around $2,500", the
  ceiling is 2500, not 2700.`;

export async function buildProfile(client, { signals, description, today }) {
  const signalBlock = signals.length
    ? signals.map((s) => `- [${s.source}] ${s.text}`).join("\n")
    : "- No accounts connected.";

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: PROFILE_SYSTEM,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: PROFILE_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Today's date: ${today}

Signals from connected accounts (simulated):
${signalBlock}

What the person wrote:
${description || "(nothing typed — work from the signals alone)"}`,
      },
    ],
  });

  return readJson(response);
}

// ---------------------------------------------------------------------------
// Agent H5 — The brief, and the messages that go out
// ---------------------------------------------------------------------------

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      description: "One sentence on why this specific home suits this specific person.",
    },
    highlights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          icon: { type: "string", description: "A single emoji." },
          text: { type: "string", description: "One concrete, specific reason. No generic praise." },
        },
        required: ["icon", "text"],
        additionalProperties: false,
      },
      description: "Three or four reasons, each tied to something in the data.",
    },
    tradeoff: {
      type: "string",
      description:
        "The honest downside of this home for this person. Every home has one; name it.",
    },
    outreach_email: {
      type: "string",
      description:
        "A short, professional inquiry to the listing agent. Plain text, ready to send, with a subject line on the first line.",
    },
    negotiation_email: {
      type: ["string", "null"],
      description:
        "If a rent reduction was calculated, a courteous email making that specific offer. Null if there is no leverage.",
    },
  },
  required: ["verdict", "highlights", "tradeoff", "outreach_email", "negotiation_email"],
  additionalProperties: false,
};

const BRIEF_SYSTEM = `You are the advisory agent of a Washington, DC housing assistant.

You are given one listing, one renter's profile, and figures that were already
computed in code: the true monthly cost, the door-to-door commute, and any
negotiating leverage from days on market.

Rules:
- Use the computed numbers exactly as given. Never recompute a commute time, a
  monthly total, or a rent reduction, and never state a figure you were not given.
- Be specific to this person. "Great location" is worthless; "your dog park is
  two blocks north on S Street" is the product.
- Name the real tradeoff. A recommendation with no downside reads as a
  advertisement, and the renter will find the downside anyway on the tour.
- Emails are short, plain, and courteous. No exclamation marks, no hard sell.
  The negotiation email opens with genuine interest, states the offer once with
  its reason, and leaves the door open.
- Never claim the renter has already seen the unit or spoken to anyone.`;

export async function writeBrief(client, { profile, listing, cost, commute, leverage, neighborhood, split }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: BRIEF_SYSTEM,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: BRIEF_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Renter profile:
${JSON.stringify(profile, null, 2)}

The listing:
${JSON.stringify(
  {
    address: listing.address,
    neighborhood: listing.neighborhood,
    beds: listing.beds,
    baths: listing.baths,
    sqft: listing.sqft,
    rent: listing.rent,
    amenities: listing.amenities,
    laundry: listing.laundry,
    pets: listing.pets,
    days_on_market: listing.days_on_market,
    description: listing.description,
  },
  null,
  2
)}

The neighborhood:
${JSON.stringify(neighborhood, null, 2)}

Computed in code — use these figures verbatim:
- True monthly cost: $${cost.total} (rent $${cost.rent} plus $${cost.hiddenCost} in everything else)
- Against budget: ${cost.summary}
- Commute: ${commute ? `${commute.totalMinutes} minutes to ${commute.hub}, ${commute.mode}` : "not computed"}
- Negotiating leverage: ${
          leverage.hasLeverage
            ? `${leverage.daysOnMarket} days on market, ${leverage.strength}; a reasonable ask is $${leverage.askRent}/mo, saving $${leverage.monthlySaving}/mo`
            : `${leverage.daysOnMarket} days on market, none`
        }
${split ? `- If shared with ${split.housemates - 1} housemate: $${split.perPerson}/person` : ""}

Write the brief.`,
      },
    ],
  });

  return readJson(response);
}
