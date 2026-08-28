/**
 * Simulated account connections.
 *
 * These do not talk to Gmail, a bank, or LinkedIn. Each one is a fixed set of
 * signals that stands in for what such an integration would return, so the
 * personalization step can be demonstrated without asking anyone to hand over a
 * real inbox. The interface labels them as simulated, and so does this comment:
 * connecting real accounts is future work, not a claim being made today.
 *
 * The shape here is the contract a real connector would have to satisfy —
 * observed signals in, partial profile out.
 */

export const CONNECTORS = [
  {
    id: "gmail",
    label: "Connect Gmail",
    icon: "✉",
    blurb: "Receipts, subscriptions, and travel patterns",
    signals: [
      "14 receipts from coffee shops in the last 60 days, clustered on weekday mornings",
      "Recurring Petco autoship for a 45 lb dog, monthly",
      "SmarTrip auto-reload of $40, twice monthly — no parking or fuel receipts",
      "Race registration for the Rock Creek 10K in March",
    ],
    profile: {
      has_dog: true,
      dog_weight_lbs: 45,
      has_car: false,
      needs_parking: false,
      lifestyle: ["coffee", "dog", "running"],
    },
  },
  {
    id: "bank",
    label: "Connect bank statement",
    icon: "◫",
    blurb: "Cash flow and what is actually affordable",
    signals: [
      "Average monthly take-home deposits of $6,900",
      "Current rent debit of $2,150, paid on the 1st",
      "No car loan, no auto insurance debit",
      "Discretionary spend averages $1,180/mo — a $2,800 all-in housing ceiling holds",
    ],
    profile: {
      max_budget: 2800,
      budget_basis: "all_in",
    },
  },
  {
    id: "linkedin",
    label: "Connect LinkedIn",
    icon: "▣",
    blurb: "Where the workday actually starts",
    signals: [
      "Software engineer, mid-size firm with offices at 19th and M NW",
      "Listed as hybrid — three days in office",
      "Previously in Boston; no DC neighborhood history to draw on",
    ],
    profile: {
      work_location: "dupont",
      work_label: "Dupont Circle (19th & M NW)",
      max_commute_minutes: 30,
    },
  },
];

/** Merge the connectors the user switched on into one partial profile. */
export function mergeConnectorProfiles(connectorIds) {
  const chosen = CONNECTORS.filter((c) => connectorIds.includes(c.id));

  const merged = chosen.reduce((profile, connector) => {
    const next = { ...profile, ...connector.profile };
    if (connector.profile.lifestyle) {
      next.lifestyle = [
        ...new Set([...(profile.lifestyle || []), ...connector.profile.lifestyle]),
      ];
    }
    return next;
  }, {});

  return {
    profile: merged,
    signals: chosen.flatMap((connector) =>
      connector.signals.map((signal) => ({ source: connector.id, text: signal }))
    ),
  };
}
