/**
 * Stage safety.
 *
 * Demo mode is what runs if the API key is missing or the venue wifi dies, so
 * the canned content has to survive the same checks the live output does. If the
 * hand-written demo letter ever fails its own verifier, the demo fails in front
 * of judges — these tests make that a red build instead.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { selectProvisions } from "../lib/retrieval.js";
import { verifyDraft } from "../lib/verify.js";
import { computeDeadlines } from "../lib/deadlines.js";
import { getActionPlan, ACTION_PLANS } from "../lib/actionPlans.js";
import {
  DEMO_CLASSIFICATION,
  DEMO_STRATEGY,
  DEMO_LETTER,
  DEMO_DESCRIPTION,
  FABRICATED_SENTENCE,
} from "../lib/demo.js";
import { composeBrief } from "../lib/homefinder/fallbackBrief.js";
import { filterListings, scoreListing } from "../lib/homefinder/match.js";
import { estimateCommute } from "../lib/homefinder/commute.js";
import { estimateMonthlyCost, estimateSplitCost } from "../lib/homefinder/budget.js";
import { assessLeverage } from "../lib/homefinder/negotiate.js";
import { mergeConnectorProfiles, CONNECTORS } from "../lib/homefinder/connectors.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name) =>
  JSON.parse(readFileSync(path.join(here, "..", "data", name), "utf8"));

const CORPUS = read("dcTenantLaw.json");
const LISTINGS = read("dcListings.json");
const { neighborhoods: HOODS } = read("dcNeighborhoods.json");

const demoProvisions = selectProvisions(CORPUS, {
  category: DEMO_CLASSIFICATION.category,
  text: `${DEMO_DESCRIPTION} ${DEMO_CLASSIFICATION.key_facts.join(" ")}`,
});

test("the demo letter passes its own verifier", () => {
  const result = verifyDraft(DEMO_LETTER, demoProvisions);

  assert.equal(
    result.passed,
    true,
    "problems: " + JSON.stringify(result.citations.filter((c) => c.status !== "verified"), null, 2)
  );
  assert.ok(result.summary.citationsVerified >= 3, "the demo should show several verified citations");
  assert.ok(result.summary.tagsVerified >= 3, "and several verified provision tags");
});

test("the planted citation fails, and only the planted citation fails", () => {
  const sabotaged = DEMO_LETTER + FABRICATED_SENTENCE;
  const result = verifyDraft(sabotaged, demoProvisions);

  assert.equal(result.passed, false);

  const bad = result.citations.filter((c) => c.status !== "verified");
  assert.equal(bad.length, 1, "exactly one fabricated statute");
  assert.equal(bad[0].section, "42-3502.44");

  const badTags = result.tags.filter((t) => t.status !== "verified");
  assert.equal(badTags.length, 1);
  assert.equal(badTags[0].id, "DC-DEPOSIT-WEEKLY-PENALTY");
});

test("the deadline the demo letter states matches what the code computes", () => {
  const clocks = computeDeadlines(demoProvisions, {
    triggerDate: DEMO_CLASSIFICATION.trigger_date,
    triggerKind: DEMO_CLASSIFICATION.trigger_kind,
    today: new Date(Date.UTC(2026, 7, 28)),
  });

  const fortyFive = clocks.find((c) => c.provisionId === "DC-DEPOSIT-RETURN");
  assert.equal(fortyFive.dueDate, "2026-08-14");
  assert.ok(
    DEMO_LETTER.includes("August 14, 2026"),
    "the letter must state the same date the deadline agent computes"
  );
});

test("the demo strategy resolves to a real action plan", () => {
  const plan = getActionPlan(DEMO_STRATEGY.path);
  assert.ok(plan.steps.length >= 4);
  assert.ok(plan.venue);
});

test("every strategy path the model can choose has an action plan", () => {
  for (const path of [
    "demand_letter",
    "ota_complaint",
    "tenant_petition",
    "small_claims",
    "emergency_help",
  ]) {
    assert.ok(ACTION_PLANS[path], `no action plan for ${path}`);
    assert.ok(ACTION_PLANS[path].steps.length >= 4, `${path} needs real steps`);
  }
});

test("connecting all three sources produces a usable profile", () => {
  const { profile, signals } = mergeConnectorProfiles(CONNECTORS.map((c) => c.id));

  assert.equal(profile.has_dog, true);
  assert.equal(profile.max_budget, 2800);
  assert.equal(profile.work_location, "dupont");
  assert.ok(signals.length >= 8, "each connector should contribute visible signals");
});

test("the demo housing pipeline runs end to end and produces sendable emails", () => {
  const { profile: connectorProfile } = mergeConnectorProfiles(["gmail", "bank", "linkedin"]);
  const profile = {
    bedrooms_min: 1,
    has_cat: false,
    needs_in_unit_laundry: false,
    ...connectorProfile,
  };

  const { eligible, funnel } = filterListings(LISTINGS, HOODS, profile);
  assert.ok(eligible.length >= 3, "the demo profile must match at least three homes");
  assert.equal(funnel.at(-1).remaining, eligible.length);

  const ranked = eligible
    .map((listing) => {
      const commute = estimateCommute(listing, HOODS, profile.work_location);
      const cost = estimateMonthlyCost(listing, HOODS, profile);
      return {
        listing,
        commute,
        cost,
        scored: scoreListing(listing, HOODS, profile, cost, commute),
        split: estimateSplitCost(listing, cost, profile),
        leverage: assessLeverage(listing),
        neighborhood: HOODS[listing.neighborhood],
      };
    })
    .sort((a, b) => b.scored.score - a.scored.score)
    .slice(0, 3);

  for (const match of ranked) {
    const brief = composeBrief({ ...match, profile });

    assert.ok(brief.verdict.length > 20);
    assert.ok(brief.highlights.length > 0);
    assert.ok(brief.tradeoff.startsWith("The honest downside"));
    assert.ok(brief.outreach_email.startsWith("Subject:"));
    assert.ok(
      brief.outreach_email.includes(match.listing.address),
      "the email must name the actual address"
    );

    if (match.leverage.hasLeverage) {
      assert.ok(
        brief.negotiation_email.includes(match.leverage.askRent.toLocaleString("en-US")),
        "the offer email must state the computed ask, formatted for a US reader"
      );
      assert.ok(
        !/\$\d+\.\d{3}/.test(brief.negotiation_email),
        "dollar figures must not be formatted with a European decimal separator"
      );
    } else {
      assert.equal(brief.negotiation_email, null);
    }
  }
});

test("no recommended home is missing a computed commute for a profile with a workplace", () => {
  const { profile: connectorProfile } = mergeConnectorProfiles(["gmail", "bank", "linkedin"]);
  const profile = { bedrooms_min: 1, has_cat: false, ...connectorProfile };
  const { eligible } = filterListings(LISTINGS, HOODS, profile);

  for (const listing of eligible) {
    assert.ok(
      estimateCommute(listing, HOODS, profile.work_location),
      `no commute computed for ${listing.id}`
    );
  }
});
