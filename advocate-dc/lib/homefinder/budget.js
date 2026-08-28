/**
 * Financial Fit Agent — deterministic.
 *
 * A listing's rent is not what it costs to live there. This agent adds the
 * things a rental site leaves off the price tag — utilities, pet rent, parking,
 * a transit pass — and reports the real monthly number against the budget the
 * user actually has. All arithmetic, no model.
 *
 * Pure functions only — no imports, so this module is testable in plain Node.
 */

/** A monthly Metrorail commute at current fares, rounded to a usable figure. */
export const TRANSIT_PASS_MONTHLY = 108;
/** Parking, insurance, and fuel for keeping a car in the District. */
export const CAR_OVERHEAD_MONTHLY = 190;
/** Renters insurance, which most DC buildings require. */
export const RENTERS_INSURANCE_MONTHLY = 18;

export function estimateMonthlyCost(listing, neighborhoods, profile) {
  const hood = neighborhoods[listing.neighborhood] || {};
  const lines = [];

  lines.push({ label: "Rent", amount: listing.rent, note: null });

  const includedAll = (listing.utilities_included || []).length >= 3;
  const utilities = includedAll
    ? 0
    : Math.round(
        (hood.avg_utilities || 140) *
          (listing.utilities_included?.length ? 0.55 : 1)
      );
  lines.push({
    label: "Utilities",
    amount: utilities,
    note: listing.utilities_included?.length
      ? `${listing.utilities_included.join(", ")} included in rent`
      : `neighborhood average for a ${listing.beds === 0 ? "studio" : `${listing.beds}-bedroom`}`,
  });

  if (profile.has_dog || profile.has_cat) {
    lines.push({
      label: "Pet rent",
      amount: listing.pets.monthly_pet_rent || 0,
      note: listing.pets.monthly_pet_rent ? "charged monthly, not a one-time fee" : "no pet rent at this building",
    });
  }

  if (profile.has_car) {
    const parking = listing.parking.available ? listing.parking.monthly : 0;
    lines.push({
      label: "Parking",
      amount: parking,
      note: listing.parking.available ? "on-site garage" : "no on-site parking; street permit assumed",
    });
    lines.push({ label: "Car overhead", amount: CAR_OVERHEAD_MONTHLY, note: "insurance and fuel, DC average" });
  } else {
    lines.push({
      label: "Transit",
      amount: TRANSIT_PASS_MONTHLY,
      note: "Metrorail commute, both directions",
    });
  }

  lines.push({ label: "Renters insurance", amount: RENTERS_INSURANCE_MONTHLY, note: "required by most DC buildings" });

  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const budget = profile.max_budget || 0;

  // A rent-only budget is compared against rent; an all-in budget against the total.
  const compareAgainst = profile.budget_basis === "rent_only" ? listing.rent : total;
  const delta = budget - compareAgainst;

  return {
    lines,
    total,
    rent: listing.rent,
    hiddenCost: total - listing.rent,
    budget,
    delta,
    fits: delta >= 0,
    verdict:
      delta >= 300
        ? "comfortable"
        : delta >= 0
        ? "tight"
        : delta >= -200
        ? "slightly_over"
        : "over",
    summary:
      delta >= 0
        ? `$${delta.toLocaleString()} under budget, all in.`
        : `$${Math.abs(delta).toLocaleString()} over budget once everything is counted.`,
  };
}

/**
 * What the same unit costs if it is shared. Only meaningful for multi-bedroom
 * listings, and only rent and utilities split — pet rent and transit do not.
 */
export function estimateSplitCost(listing, cost, profile) {
  if (listing.beds < 2) return null;

  const shareable = cost.lines
    .filter((line) => ["Rent", "Utilities", "Parking"].includes(line.label))
    .reduce((sum, line) => sum + line.amount, 0);
  const personal = cost.total - shareable;

  const perPerson = Math.round(shareable / listing.beds + personal);
  const budget = profile.max_budget || 0;

  return {
    housemates: listing.beds,
    perPerson,
    saving: cost.total - perPerson,
    fits: budget - perPerson >= 0,
    delta: budget - perPerson,
  };
}
