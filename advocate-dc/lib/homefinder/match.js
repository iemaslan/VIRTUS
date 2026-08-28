/**
 * Matching Agent — deterministic.
 *
 * Filtering and ranking listings is the same kind of problem as retrieving a
 * statute: a model would be slower, non-reproducible, and occasionally wrong
 * about arithmetic it has no business doing. So the funnel below is code, and
 * every number the dashboard shows is a real count from the real dataset.
 *
 * Pure functions, with no dependency beyond a sibling helper, so this module is
 * testable in plain Node with nothing installed.
 */

import { estimateCommute } from "./commute.js";

/** How much over the stated budget a listing may be before it is dropped outright. */
const BUDGET_TOLERANCE = 1.12;

/**
 * Run the hard filters, recording what each one removed.
 * The returned funnel is what the UI animates — it is not decoration, it is the
 * actual execution trace.
 */
export function filterListings(listings, neighborhoods, profile) {
  const funnel = [];
  let pool = listings.slice();

  const step = (label, predicate, reason) => {
    const before = pool.length;
    const kept = pool.filter(predicate);
    const removed = before - kept.length;
    pool = kept;
    funnel.push({ label, removed, remaining: pool.length, reason });
  };

  funnel.push({
    label: `Scanned ${listings.length} active DC listings`,
    removed: 0,
    remaining: listings.length,
    reason: "starting pool",
  });

  if (profile.max_budget) {
    step(
      `Rent above $${Math.round(profile.max_budget * BUDGET_TOLERANCE).toLocaleString()}`,
      (l) => l.rent <= profile.max_budget * BUDGET_TOLERANCE,
      "priced beyond reach even before utilities"
    );
  }

  if (profile.bedrooms_min > 0) {
    step(
      `Fewer than ${profile.bedrooms_min} bedroom${profile.bedrooms_min === 1 ? "" : "s"}`,
      (l) => l.beds >= profile.bedrooms_min,
      "too small for the household"
    );
  }

  if (profile.has_dog) {
    step(
      "Does not allow dogs",
      (l) =>
        l.pets.dogs &&
        (!profile.dog_weight_lbs ||
          !l.pets.dog_weight_limit_lbs ||
          profile.dog_weight_lbs <= l.pets.dog_weight_limit_lbs),
      "pet policy excludes this household"
    );
  }

  if (profile.has_cat) {
    step("Does not allow cats", (l) => l.pets.cats, "pet policy excludes this household");
  }

  if (profile.needs_in_unit_laundry) {
    step("No in-unit laundry", (l) => l.laundry === "in_unit", "stated requirement");
  }

  if (profile.needs_parking) {
    step("No on-site parking", (l) => l.parking.available, "stated requirement");
  }

  if (profile.work_location && profile.max_commute_minutes) {
    step(
      `Commute over ${profile.max_commute_minutes} minutes`,
      (l) => {
        const commute = estimateCommute(l, neighborhoods, profile.work_location);
        return commute && commute.totalMinutes <= profile.max_commute_minutes;
      },
      "too far from where the day starts"
    );
  }

  return { eligible: pool, funnel };
}

/** Lifestyle signals we can check against the datasets, and what satisfies them. */
const LIFESTYLE_SIGNALS = {
  running: {
    listing: () => false,
    neighborhood: (hood) => (hood.running || []).length > 0,
    label: "running routes nearby",
  },
  dog: {
    listing: (l) => l.amenities.includes("dog_run"),
    neighborhood: (hood) => (hood.dog_parks || []).length > 0,
    label: "dog parks and a dog run",
  },
  coffee: {
    listing: () => false,
    neighborhood: (hood) => (hood.coffee || []).length >= 2,
    label: "coffee within walking distance",
  },
  nightlife: {
    listing: (l) => l.amenities.includes("rooftop"),
    neighborhood: (hood) => hood.walk_score >= 92,
    label: "a walkable night out",
  },
  fitness: {
    listing: (l) => l.amenities.includes("gym") || l.amenities.includes("pool"),
    neighborhood: () => false,
    label: "a gym in the building",
  },
  quiet: {
    listing: (l) => !l.amenities.includes("rooftop"),
    neighborhood: (hood) => hood.walk_score < 92,
    label: "a quieter block",
  },
  outdoors: {
    listing: (l) => l.amenities.includes("backyard") || l.amenities.includes("courtyard"),
    neighborhood: (hood) => (hood.running || []).length > 0,
    label: "outdoor space",
  },
};

/**
 * Score one eligible listing from 0 to 100.
 * The weights are stated here rather than buried, because a ranking nobody can
 * inspect is a ranking nobody should trust.
 */
export function scoreListing(listing, neighborhoods, profile, cost, commute) {
  const hood = neighborhoods[listing.neighborhood] || {};
  const reasons = [];

  // Budget headroom — 30 points. Rewards fitting, not undershooting.
  let budgetPoints = 0;
  if (cost.fits) {
    const headroomRatio = Math.min(cost.delta / Math.max(profile.max_budget, 1), 0.25);
    budgetPoints = 18 + Math.round(headroomRatio * 48);
    reasons.push({
      kind: "budget",
      text: `$${cost.total.toLocaleString()}/mo all in — ${cost.summary}`,
    });
  } else {
    budgetPoints = Math.max(0, 18 + Math.round(cost.delta / 40));
  }
  budgetPoints = Math.min(30, budgetPoints);

  // Commute — 25 points.
  let commutePoints = 0;
  if (commute) {
    const ceiling = profile.max_commute_minutes || 45;
    commutePoints = Math.max(0, Math.round(25 * (1 - commute.totalMinutes / ceiling)));
    reasons.push({
      kind: "commute",
      text: `${commute.totalMinutes} minutes door to door, ${
        commute.mode === "walk" ? "on foot" : `via ${commute.lines.join("/")} from ${commute.station}`
      }.`,
    });
  }

  // Lifestyle fit — 25 points, distributed across whatever the user told us.
  const wants = profile.lifestyle || [];
  let lifestylePoints = 0;
  if (wants.length) {
    const perSignal = 25 / wants.length;
    for (const want of wants) {
      const signal = LIFESTYLE_SIGNALS[want];
      if (!signal) continue;
      const inListing = signal.listing(listing);
      const inHood = signal.neighborhood(hood);
      if (inListing || inHood) {
        lifestylePoints += inListing && inHood ? perSignal : perSignal * 0.7;
        reasons.push({ kind: want, text: capitalize(signal.label) + " in " + listing.neighborhood + "." });
      }
    }
  } else {
    lifestylePoints = 12;
  }
  lifestylePoints = Math.min(25, Math.round(lifestylePoints));

  // Space per dollar — 10 points.
  const sqftPerDollar = listing.sqft / listing.rent;
  const spacePoints = Math.min(10, Math.round(sqftPerDollar * 28));

  // Negotiating leverage — 10 points. A listing sitting unrented is an opening.
  const leveragePoints = Math.min(10, Math.round(listing.days_on_market / 8));

  const score = Math.min(
    100,
    budgetPoints + commutePoints + lifestylePoints + spacePoints + leveragePoints
  );

  return {
    score,
    components: {
      budget: budgetPoints,
      commute: commutePoints,
      lifestyle: lifestylePoints,
      space: spacePoints,
      leverage: leveragePoints,
    },
    reasons,
  };
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
