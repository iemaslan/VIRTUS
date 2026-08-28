/**
 * Commute Agent — deterministic.
 *
 * "18 minutes to work" is a number, and numbers come from code. Walk time to
 * the station comes from the listing, ride time from the neighborhood matrix,
 * and a fixed platform-wait allowance keeps the estimate honest rather than
 * optimistic.
 *
 * Pure functions only — no imports, so this module is testable in plain Node.
 */

const PLATFORM_WAIT_MINUTES = 4;
const WALKING_MINUTES_PER_MILE = 20;

export function estimateCommute(listing, neighborhoods, hubKey) {
  const hood = neighborhoods[listing.neighborhood];
  if (!hood || !hubKey) return null;

  const ride = hood.commute_minutes[hubKey];
  if (typeof ride !== "number") return null;

  const walk = listing.metro.walk_minutes;

  // Living in the neighborhood you work in: walking beats waiting for a train.
  if (ride === 0) {
    return {
      hub: hubKey,
      totalMinutes: Math.max(6, Math.round(walk * 1.4)),
      mode: "walk",
      breakdown: [{ label: "Walk, entirely within the neighborhood", minutes: Math.max(6, Math.round(walk * 1.4)) }],
      station: listing.metro.station,
      lines: listing.metro.lines,
    };
  }

  const total = walk + PLATFORM_WAIT_MINUTES + ride;
  return {
    hub: hubKey,
    totalMinutes: total,
    mode: "metro",
    station: listing.metro.station,
    lines: listing.metro.lines,
    breakdown: [
      { label: `Walk to ${listing.metro.station}`, minutes: walk },
      { label: "Platform wait, average", minutes: PLATFORM_WAIT_MINUTES },
      { label: `${listing.metro.lines.join("/")} Line ride`, minutes: ride },
    ],
  };
}

/** Rough walking distance in minutes for a stated mileage, used for amenities. */
export function walkMinutesForMiles(miles) {
  return Math.round(miles * WALKING_MINUTES_PER_MILE);
}
