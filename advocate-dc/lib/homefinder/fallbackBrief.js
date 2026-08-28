/**
 * The brief, composed in code.
 *
 * Used in demo mode, when no API key is configured. It reads worse than the
 * model's version — it is assembled from templates rather than written — but
 * every fact in it comes from the same computed figures, so the demo is honest
 * and the app never depends on a network connection to run end to end.
 */

/**
 * These strings end up in an email to a DC landlord, so the number formatting is
 * pinned to en-US rather than inherited from whatever locale the server happens
 * to run under. "$1.760" would read as a different offer entirely.
 */
const usd = (amount) => amount.toLocaleString("en-US");

const HIGHLIGHT_ICONS = {
  budget: "💵",
  commute: "🚇",
  dog: "🐶",
  running: "🏃",
  coffee: "☕",
  nightlife: "🌃",
  fitness: "🏋️",
  quiet: "🌙",
  outdoors: "🌳",
};

export function composeBrief({ profile, listing, cost, commute, leverage, neighborhood, scored, split }) {
  const highlights = scored.reasons.slice(0, 4).map((reason) => ({
    icon: HIGHLIGHT_ICONS[reason.kind] || "•",
    text: reason.text,
  }));

  if (neighborhood?.dog_parks?.length && profile.has_dog) {
    highlights.push({
      icon: "🐶",
      text: `${neighborhood.dog_parks[0]} is the closest off-leash space to this address.`,
    });
  }

  const tradeoffs = [];
  if (listing.laundry !== "in_unit") tradeoffs.push("laundry is shared, not in the unit");
  if (!listing.parking.available && profile.has_car) tradeoffs.push("there is no on-site parking");
  if (commute && commute.totalMinutes > 25) tradeoffs.push(`the commute is ${commute.totalMinutes} minutes each way`);
  if (listing.sqft < 600) tradeoffs.push(`${listing.sqft} square feet is tight`);
  if (!cost.fits) tradeoffs.push(`it runs ${cost.summary.toLowerCase()}`);

  const tradeoff = tradeoffs.length
    ? `The honest downside: ${tradeoffs.slice(0, 2).join(", and ")}.`
    : "The honest downside: this one is popular, so it will not sit on the market long.";

  const outreach = `Subject: Inquiry about ${listing.address}

Hello,

I am interested in the ${listing.beds === 0 ? "studio" : `${listing.beds}-bedroom`} at ${listing.address} in ${listing.neighborhood}, listed at $${usd(listing.rent)} per month.

I am looking to move in the next several weeks and can provide employment verification, references, and proof of income.${
    profile.has_dog ? " I have one dog and can share vet and vaccination records." : ""
  }

Could you let me know whether the unit is still available and when it could be viewed?

Thank you,
[YOUR NAME]
[YOUR PHONE] · [YOUR EMAIL]`;

  const negotiation = leverage.hasLeverage
    ? `Subject: ${listing.address} — offer

Hello,

Thank you for the information about ${listing.address}. I am genuinely interested and would be ready to sign quickly.

I noticed the unit has been listed for ${leverage.daysOnMarket} days. Would the owner consider $${usd(leverage.askRent)} per month on a twelve-month lease? At that rate I could commit right away and take an early move-in date.

If the asking rent is firm I understand, and I would still like to arrange a viewing.

Thank you,
[YOUR NAME]`
    : null;

  return {
    verdict: `${listing.address} fits ${
      cost.fits ? "inside your budget" : "just outside your budget"
    } at $${usd(cost.total)} a month all in${
      commute ? `, with a ${commute.totalMinutes}-minute commute` : ""
    }.`,
    highlights: highlights.slice(0, 4),
    tradeoff,
    outreach_email: outreach,
    negotiation_email: negotiation,
    split: split || null,
  };
}
