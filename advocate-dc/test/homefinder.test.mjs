/**
 * The home-finding half of the product uses the same architecture: judgment in
 * the model, arithmetic and filtering in code. These tests cover the code half.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { filterListings, scoreListing } from "../lib/homefinder/match.js";
import { estimateCommute } from "../lib/homefinder/commute.js";
import { estimateMonthlyCost, estimateSplitCost } from "../lib/homefinder/budget.js";
import { assessLeverage } from "../lib/homefinder/negotiate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name) =>
  JSON.parse(readFileSync(path.join(here, "..", "data", name), "utf8"));

const LISTINGS = read("dcListings.json");
const { neighborhoods: HOODS } = read("dcNeighborhoods.json");

const DOG_OWNER = {
  max_budget: 2800,
  budget_basis: "all_in",
  bedrooms_min: 1,
  has_dog: true,
  dog_weight_lbs: 45,
  has_cat: false,
  has_car: false,
  needs_parking: false,
  needs_in_unit_laundry: false,
  work_location: "dupont",
  max_commute_minutes: 30,
  lifestyle: ["running", "dog", "coffee"],
};

test("the funnel removes real listings and reports real counts", () => {
  const { eligible, funnel } = filterListings(LISTINGS, HOODS, DOG_OWNER);

  assert.equal(funnel[0].remaining, LISTINGS.length);
  assert.ok(eligible.length > 0, "some listing should survive");
  assert.ok(eligible.length < LISTINGS.length, "the filters should remove something");

  // Every step's arithmetic has to actually add up.
  for (let i = 1; i < funnel.length; i++) {
    assert.equal(
      funnel[i].remaining,
      funnel[i - 1].remaining - funnel[i].removed,
      `funnel step "${funnel[i].label}" does not balance`
    );
  }
  assert.equal(funnel.at(-1).remaining, eligible.length);
});

test("a dog owner is never shown a building that bans dogs", () => {
  const { eligible } = filterListings(LISTINGS, HOODS, DOG_OWNER);
  assert.ok(eligible.every((l) => l.pets.dogs));
});

test("a dog over the building's weight limit disqualifies the listing", () => {
  const bigDog = { ...DOG_OWNER, dog_weight_lbs: 75, max_commute_minutes: 60 };
  const { eligible } = filterListings(LISTINGS, HOODS, bigDog);

  assert.ok(
    eligible.every(
      (l) => !l.pets.dog_weight_limit_lbs || l.pets.dog_weight_limit_lbs >= 75
    )
  );
});

test("commute is walk plus wait plus ride, not a guess", () => {
  const navyYard = LISTINGS.find((l) => l.id === "DC-006");
  const commute = estimateCommute(navyYard, HOODS, "dupont");

  const walk = navyYard.metro.walk_minutes;
  const ride = HOODS["Navy Yard"].commute_minutes.dupont;
  assert.equal(commute.totalMinutes, walk + 4 + ride);
  assert.equal(commute.breakdown.reduce((s, b) => s + b.minutes, 0), commute.totalMinutes);
});

test("living in the neighborhood you work in is a walk, not a train ride", () => {
  const dupont = LISTINGS.find((l) => l.neighborhood === "Dupont Circle");
  const commute = estimateCommute(dupont, HOODS, "dupont");
  assert.equal(commute.mode, "walk");
});

test("the real monthly cost is higher than the rent, and itemized", () => {
  const listing = LISTINGS.find((l) => l.id === "DC-011");
  const cost = estimateMonthlyCost(listing, HOODS, DOG_OWNER);

  assert.ok(cost.total > listing.rent, "utilities and transit must be added");
  assert.equal(
    cost.lines.reduce((sum, line) => sum + line.amount, 0),
    cost.total,
    "the itemization must sum to the total"
  );
  assert.equal(cost.hiddenCost, cost.total - listing.rent);
  assert.ok(cost.lines.some((l) => l.label === "Pet rent"), "a dog owner sees pet rent");
  assert.ok(cost.lines.some((l) => l.label === "Transit"), "a car-free renter sees a transit pass");
});

test("a listing under asking rent can still be over budget once counted", () => {
  const listing = LISTINGS.find((l) => l.id === "DC-004"); // $2,680 rent
  const cost = estimateMonthlyCost(listing, HOODS, { ...DOG_OWNER, max_budget: 2800 });

  assert.ok(listing.rent < 2800, "rent alone fits the budget");
  assert.equal(cost.fits, false, "the all-in cost does not");
  assert.match(cost.summary, /over budget/);
});

test("a car owner pays for parking and overhead instead of a transit pass", () => {
  const listing = LISTINGS.find((l) => l.id === "DC-006");
  const cost = estimateMonthlyCost(listing, HOODS, { ...DOG_OWNER, has_car: true });

  assert.ok(cost.lines.some((l) => l.label === "Parking"));
  assert.ok(cost.lines.some((l) => l.label === "Car overhead"));
  assert.ok(!cost.lines.some((l) => l.label === "Transit"));
});

test("splitting a two-bedroom lowers the per-person cost below the whole", () => {
  const listing = LISTINGS.find((l) => l.beds === 2);
  const cost = estimateMonthlyCost(listing, HOODS, DOG_OWNER);
  const split = estimateSplitCost(listing, cost, DOG_OWNER);

  assert.equal(split.housemates, 2);
  assert.ok(split.perPerson < cost.total);
  assert.equal(split.saving, cost.total - split.perPerson);
});

test("a studio cannot be split", () => {
  const studio = LISTINGS.find((l) => l.beds === 0);
  const cost = estimateMonthlyCost(studio, HOODS, DOG_OWNER);
  assert.equal(estimateSplitCost(studio, cost, DOG_OWNER), null);
});

test("negotiating leverage tracks days on market", () => {
  const fresh = assessLeverage({ rent: 2500, days_on_market: 6 });
  assert.equal(fresh.hasLeverage, false);
  assert.equal(fresh.monthlySaving, 0);

  const stale = assessLeverage({ rent: 2500, days_on_market: 63 });
  assert.equal(stale.hasLeverage, true);
  assert.equal(stale.strength, "strong");
  assert.ok(stale.askRent < 2500);
  assert.equal(stale.annualSaving, stale.monthlySaving * 12);
});

test("scoring is bounded and explains itself", () => {
  const { eligible } = filterListings(LISTINGS, HOODS, DOG_OWNER);

  for (const listing of eligible) {
    const cost = estimateMonthlyCost(listing, HOODS, DOG_OWNER);
    const commute = estimateCommute(listing, HOODS, DOG_OWNER.work_location);
    const scored = scoreListing(listing, HOODS, DOG_OWNER, cost, commute);

    assert.ok(scored.score >= 0 && scored.score <= 100, `score out of range: ${scored.score}`);
    assert.ok(scored.reasons.length > 0, "every score must come with reasons");
  }
});

test("the same profile always produces the same ranking", () => {
  const rank = () => {
    const { eligible } = filterListings(LISTINGS, HOODS, DOG_OWNER);
    return eligible
      .map((listing) => {
        const cost = estimateMonthlyCost(listing, HOODS, DOG_OWNER);
        const commute = estimateCommute(listing, HOODS, DOG_OWNER.work_location);
        return { id: listing.id, score: scoreListing(listing, HOODS, DOG_OWNER, cost, commute).score };
      })
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .map((r) => r.id);
  };

  assert.deepEqual(rank(), rank());
});
