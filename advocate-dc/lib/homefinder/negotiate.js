/**
 * Negotiation Agent — the arithmetic half, deterministic.
 *
 * A listing that has sat on the market for two months is a different
 * negotiation from one posted last week. The leverage calculation is code; the
 * model only writes the email once this has decided what to ask for.
 *
 * Pure functions only — no imports, so this module is testable in plain Node.
 */

const BANDS = [
  { minDays: 60, pct: 0.06, strength: "strong", note: "Two months unrented in this market is real pressure." },
  { minDays: 45, pct: 0.05, strength: "strong", note: "Past the six-week mark, most managers are authorized to discount." },
  { minDays: 30, pct: 0.035, strength: "moderate", note: "A month on the market is usually enough to open a conversation." },
  { minDays: 21, pct: 0.02, strength: "slight", note: "Some room, but not much — lead with a longer lease term instead." },
];

export function assessLeverage(listing) {
  const band = BANDS.find((b) => listing.days_on_market >= b.minDays);

  if (!band) {
    return {
      hasLeverage: false,
      daysOnMarket: listing.days_on_market,
      strength: "none",
      note: "Listed recently. Expect to pay asking rent; ask for a free month or waived fees instead of a lower rate.",
      askRent: listing.rent,
      monthlySaving: 0,
      annualSaving: 0,
    };
  }

  const askRent = Math.round((listing.rent * (1 - band.pct)) / 5) * 5;
  const monthlySaving = listing.rent - askRent;

  return {
    hasLeverage: true,
    daysOnMarket: listing.days_on_market,
    strength: band.strength,
    percentOff: Math.round(band.pct * 1000) / 10,
    note: band.note,
    askRent,
    monthlySaving,
    annualSaving: monthlySaving * 12,
  };
}
