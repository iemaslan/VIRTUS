/**
 * The home-finding pipeline, streamed.
 *
 * Same wire format as /api/advocate — newline-delimited JSON, one event per
 * line — and the same division of labour: the model profiles and writes, the
 * code filters and counts.
 */

import { createClient, MODEL } from "../../../lib/agents.js";
import { buildProfile, writeBrief } from "../../../lib/homefinder/agents.js";
import { LISTINGS, NEIGHBORHOODS, HUBS } from "../../../lib/homefinder/data.js";
import { mergeConnectorProfiles } from "../../../lib/homefinder/connectors.js";
import { filterListings, scoreListing } from "../../../lib/homefinder/match.js";
import { estimateCommute } from "../../../lib/homefinder/commute.js";
import { estimateMonthlyCost, estimateSplitCost } from "../../../lib/homefinder/budget.js";
import { assessLeverage } from "../../../lib/homefinder/negotiate.js";
import { composeBrief } from "../../../lib/homefinder/fallbackBrief.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel's Hobby plan caps serverless functions at 60s; Pro allows more.
export const maxDuration = 60;

const TOP_N = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Used when no key is set: the connector signals alone are enough to profile. */
const DEMO_PROFILE_DEFAULTS = {
  headline:
    "A car-free software engineer with a 45 lb dog, working near Dupont Circle on a $2,800 all-in ceiling.",
  max_budget: 2800,
  budget_basis: "all_in",
  bedrooms_min: 1,
  work_location: "dupont",
  work_label: "Dupont Circle (19th & M NW)",
  max_commute_minutes: 30,
  has_dog: true,
  dog_weight_lbs: 45,
  has_cat: false,
  has_car: false,
  needs_parking: false,
  needs_in_unit_laundry: false,
  lifestyle: ["coffee", "dog", "running"],
  non_negotiables: [
    "The building has to take a 45 lb dog.",
    "No car, so the unit has to be genuinely metro-accessible.",
  ],
  assumptions: [
    "A 30-minute commute ceiling was assumed from the hybrid schedule on LinkedIn.",
    "The $2,800 ceiling is treated as all-in, not rent-only.",
  ],
};

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  const description = String(body.description || "").trim().slice(0, 4000);
  const connectorIds = Array.isArray(body.connectors) ? body.connectors : [];

  if (!description && connectorIds.length === 0) {
    return Response.json(
      { error: "Connect at least one account, or tell us what you are looking for." },
      { status: 400 }
    );
  }

  const client = await createClient();
  const demoMode = client === null;
  const today = new Date().toISOString().slice(0, 10);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      const started = (id) => send({ type: "agent", id, status: "running" });
      const finished = (id, data) => send({ type: "agent", id, status: "done", data });

      try {
        send({ type: "start", demoMode, model: demoMode ? null : MODEL, listingCount: LISTINGS.length });

        // --- Agent H1: profile (model) -----------------------------------
        started(1);
        const { profile: connectorProfile, signals } = mergeConnectorProfiles(connectorIds);
        send({ type: "signals", signals });

        const profile = demoMode
          ? (await sleep(800), { ...DEMO_PROFILE_DEFAULTS, ...connectorProfile })
          : await buildProfile(client, { signals, description, today });
        finished(1, { profile });

        // --- Agent H2: match (code) --------------------------------------
        started(2);
        const { eligible, funnel } = filterListings(LISTINGS, NEIGHBORHOODS, profile);

        // The funnel is streamed step by step because watching it run is the
        // clearest possible explanation of what the agent actually did.
        for (const step of funnel) {
          send({ type: "funnel_step", step });
          await sleep(260);
        }

        if (eligible.length === 0) {
          send({
            type: "no_matches",
            message:
              "Nothing in the dataset clears every hard requirement. Relax the commute ceiling or the budget and run it again.",
            funnel,
          });
          finished(2, { funnel, eligible: [] });
          send({ type: "complete", result: { demoMode, profile, funnel, matches: [] } });
          return;
        }
        finished(2, { funnel, eligibleCount: eligible.length });

        // --- Agents H3 & H4: commute and money (code) --------------------
        started(3);
        const enriched = eligible.map((listing) => {
          const commute = estimateCommute(listing, NEIGHBORHOODS, profile.work_location);
          const cost = estimateMonthlyCost(listing, NEIGHBORHOODS, profile);
          const scored = scoreListing(listing, NEIGHBORHOODS, profile, cost, commute);
          return {
            listing,
            commute,
            cost,
            scored,
            split: estimateSplitCost(listing, cost, profile),
            leverage: assessLeverage(listing),
            neighborhood: NEIGHBORHOODS[listing.neighborhood],
          };
        });
        if (demoMode) await sleep(300);
        finished(3, { evaluated: enriched.length });

        started(4);
        const ranked = enriched
          .sort((a, b) => b.scored.score - a.scored.score || a.listing.id.localeCompare(b.listing.id))
          .slice(0, TOP_N);
        if (demoMode) await sleep(300);
        finished(4, {
          ranked: ranked.map((m) => ({
            id: m.listing.id,
            score: m.scored.score,
            total: m.cost.total,
            fits: m.cost.fits,
          })),
        });

        // --- Agent H5: brief and outreach (model) ------------------------
        started(5);
        const matches = [];
        for (const match of ranked) {
          const brief = demoMode
            ? composeBrief({ ...match, profile })
            : await writeBrief(client, {
                profile,
                listing: match.listing,
                cost: match.cost,
                commute: match.commute,
                leverage: match.leverage,
                neighborhood: match.neighborhood,
                split: match.split,
              }).catch(() => composeBrief({ ...match, profile }));

          const packaged = { ...match, brief };
          matches.push(packaged);
          send({ type: "match", match: packaged });
          if (demoMode) await sleep(250);
        }
        finished(5, { count: matches.length });

        send({
          type: "complete",
          result: {
            demoMode,
            model: demoMode ? null : MODEL,
            profile,
            funnel,
            signals,
            matches,
            hubs: HUBS,
            searchedCount: LISTINGS.length,
            generatedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error("[homefinder] pipeline failed:", error);
        send({
          type: "error",
          message:
            error?.status === 401
              ? "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY."
              : error?.message || "The pipeline failed unexpectedly.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
