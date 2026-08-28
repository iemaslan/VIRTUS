/**
 * Demo mode, for when no API key is configured.
 *
 * The claims and search results below are fixed, and the interface says so. The
 * triage, the source grading, and the verdicts are the real implementations
 * running over that fixture — so the part of the product that decides anything
 * is genuinely exercised even with no key and no network.
 */

export const DEMO_POST = `Washington DC just became the most expensive rental market on the East Coast. Average rent hit $2,400 a month in 2026, which is a 40 percent jump since 2020. The city council passed emergency rent controls last month in response. Some say landlords are already finding ways around the new rules. Honestly this is the worst housing policy I have ever seen, and rents will be even higher next year.`;

/** Claims as an extractor would return them, with the spans they came from. */
export const DEMO_CLAIMS = [
  {
    text: "Washington DC is the most expensive rental market on the East Coast.",
    quote: "Washington DC just became the most expensive rental market on the East Coast.",
  },
  {
    text: "Average rent in Washington DC reached $2,400 per month in 2026.",
    quote: "Average rent hit $2,400 a month in 2026",
  },
  {
    text: "Rents in Washington DC rose 40 percent between 2020 and 2026.",
    quote: "which is a 40 percent jump since 2020",
  },
  {
    text: "The Washington DC city council passed emergency rent controls in 2026.",
    quote: "The city council passed emergency rent controls last month in response.",
  },
  {
    text: "Some say landlords are already finding ways around the new rules.",
    quote: "Some say landlords are already finding ways around the new rules.",
  },
  {
    text: "This is the worst housing policy I have ever seen.",
    quote: "this is the worst housing policy I have ever seen",
  },
  {
    text: "Rents will be higher next year.",
    quote: "rents will be even higher next year",
  },
];

/** Fixed search results, keyed by claim text. Chosen to produce all three verdicts. */
export const DEMO_RESULTS = {
  "Washington DC is the most expensive rental market on the East Coast.": {
    results: [
      { url: "https://medium.com/@rentwatch/dc-is-the-priciest-city-now", title: "DC is the priciest city now" },
      { url: "https://www.reddit.com/r/washingtondc/comments/xyz", title: "Is DC really the most expensive?" },
    ],
    summary:
      "Nothing authoritative ranks East Coast rental markets this way. The two results are a personal blog post and a forum thread, neither of which cites a source of its own.",
  },
  "Average rent in Washington DC reached $2,400 per month in 2026.": {
    results: [
      { url: "https://www.census.gov/housing/hvs/index.html", title: "Housing Vacancies and Homeownership — U.S. Census Bureau" },
      { url: "https://www.bls.gov/cpi/factsheets/rent.htm", title: "Rent in the CPI — U.S. Bureau of Labor Statistics" },
      { url: "https://www.reuters.com/markets/us/rents-2026", title: "US rent growth cools in 2026" },
    ],
    summary:
      "Federal housing statistics publish metropolitan rent figures directly. The figure is in the range these sources report, though the exact number depends on which measure is used.",
  },
  "Rents in Washington DC rose 40 percent between 2020 and 2026.": {
    results: [
      { url: "https://www.bls.gov/regions/mid-atlantic/data/consumerpriceindex_washington_table.htm", title: "Consumer Price Index, Washington area — BLS" },
    ],
    summary:
      "The regional price index covers rent over this period. It shows substantial growth, though a reader should check whether the 40 percent figure matches the same measure and base year.",
  },
  "The Washington DC city council passed emergency rent controls in 2026.": {
    results: [
      { url: "https://dccouncil.gov/legislation/", title: "Legislation — Council of the District of Columbia" },
      { url: "https://www.washingtonpost.com/dc-md-va/2026/housing-vote/", title: "DC Council takes up housing measure" },
    ],
    summary:
      "The Council publishes its own legislative record, which is the place this would appear. Coverage exists alongside it.",
  },
};

export const DEMO_LABEL =
  "Demo mode — a fixed post and fixed search results. The triage, source grading, and verdicts below are the real code running over that fixture.";
