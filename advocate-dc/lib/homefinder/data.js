/**
 * The housing datasets.
 *
 * `data/dcListings.json` is a curated sample of DC rentals, not a live feed.
 * Every count the interface reports — listings scanned, listings filtered out —
 * is computed from this file, so the numbers on screen are true statements
 * about real data rather than a scripted animation.
 */

import listings from "../../data/dcListings.json";
import neighborhoodData from "../../data/dcNeighborhoods.json";

export const LISTINGS = listings;
export const NEIGHBORHOODS = neighborhoodData.neighborhoods;
export const HUBS = neighborhoodData.hubs;
