/**
 * The shape of the pipeline, shared by the server route and the UI.
 *
 * `kind` is the point of the whole project: two of the five agents are code,
 * not model calls, and the interface says so out loud.
 */

export const AGENTS = [
  {
    id: 1,
    name: "Intake & classification",
    kind: "model",
    detail: "Reads the tenant's own words and extracts structured facts and dates.",
  },
  {
    id: 2,
    name: "Legal grounding",
    kind: "code",
    detail: "Retrieves the applicable DC provisions from the source data. No model involved.",
  },
  {
    id: 3,
    name: "Strategy",
    kind: "model",
    detail: "Chooses the route: demand letter, agency complaint, petition, or court.",
  },
  {
    id: 4,
    name: "Drafting",
    kind: "model",
    detail: "Writes the letter, restricted to the provisions retrieved above.",
  },
  {
    id: 5,
    name: "Citation verification",
    kind: "code",
    detail: "Checks every citation in the draft against the source data. No model involved.",
  },
];

export const HOME_AGENTS = [
  {
    id: 1,
    name: "Profile",
    kind: "model",
    detail: "Turns connected signals and what you typed into an auditable profile.",
  },
  {
    id: 2,
    name: "Listing match",
    kind: "code",
    detail: "Filters the listing set against hard requirements. Every count is real.",
  },
  {
    id: 3,
    name: "Commute & neighborhood",
    kind: "code",
    detail: "Door-to-door times and what is actually within walking distance.",
  },
  {
    id: 4,
    name: "Financial fit",
    kind: "code",
    detail: "Rent plus utilities, pet rent, transit, insurance. The real number.",
  },
  {
    id: 5,
    name: "Advisor & outreach",
    kind: "model",
    detail: "Writes why each home fits you, the tradeoff, and the emails to send.",
  },
];
