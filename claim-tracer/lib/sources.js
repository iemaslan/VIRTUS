/**
 * Step 4 — Source grading and verdicts (deterministic).
 *
 * The verdict on a claim is decided here, from the URLs the search engine
 * actually returned, using rules written down in this file. A model is never
 * asked whether a source is good, because "is this a primary source" has a
 * checkable answer and a model's answer to it is a guess with a confident tone.
 *
 * Pure functions, no imports — testable in plain Node with nothing installed.
 */

export const TIERS = {
  primary_official: {
    rank: 4,
    label: "Primary — official",
    note: "Government, court, or intergovernmental body publishing its own record.",
  },
  primary_research: {
    rank: 4,
    label: "Primary — research",
    note: "Peer-reviewed literature, a preprint server, or a university publishing its own work.",
  },
  established_news: {
    rank: 3,
    label: "Established newsroom",
    note: "A newsroom with a corrections policy. Secondary, but accountable.",
  },
  reference: {
    rank: 2,
    label: "Tertiary reference",
    note: "Summarises other sources. Useful for orientation, not as an origin.",
  },
  weak: {
    rank: 1,
    label: "Weak",
    note: "Self-published, user-generated, or aggregated. No editorial accountability.",
  },
  unknown: {
    rank: 1,
    label: "Unclassified",
    note: "Not on any list in this file. Treated as weak until a human looks.",
  },
};

const OFFICIAL_SUFFIXES = [".gov", ".mil", ".int", ".gov.uk", ".europa.eu"];
const RESEARCH_SUFFIXES = [".edu", ".ac.uk"];

const RESEARCH_HOSTS = [
  "doi.org", "pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov", "arxiv.org",
  "nature.com", "science.org", "sciencedirect.com", "thelancet.com",
  "nejm.org", "bmj.com", "jamanetwork.com", "plos.org", "springer.com",
  "ssrn.com", "biorxiv.org", "medrxiv.org",
];

const OFFICIAL_HOSTS = [
  "un.org", "who.int", "worldbank.org", "imf.org", "oecd.org",
  "europa.eu", "ecb.europa.eu", "eurostat.ec.europa.eu",
];

const NEWS_HOSTS = [
  "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "npr.org",
  "nytimes.com", "washingtonpost.com", "wsj.com", "ft.com",
  "theguardian.com", "bloomberg.com", "economist.com", "axios.com",
  "politico.com", "propublica.org", "afp.com", "cnn.com", "nbcnews.com",
  "cbsnews.com", "abcnews.go.com", "latimes.com",
];

const REFERENCE_HOSTS = ["wikipedia.org", "britannica.com", "snopes.com", "factcheck.org", "politifact.com"];

const WEAK_HOSTS = [
  "medium.com", "substack.com", "blogspot.com", "wordpress.com",
  "quora.com", "reddit.com", "x.com", "twitter.com", "facebook.com",
  "instagram.com", "tiktok.com", "youtube.com", "pinterest.com",
  "linkedin.com", "tumblr.com",
];

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Classify one URL into a tier. Host-based and fully inspectable. */
export function classifySource(url) {
  const host = hostOf(url);
  if (!host) return { url, host: null, tier: "unknown", ...TIERS.unknown };

  const match = (list) => list.some((h) => host === h || host.endsWith("." + h));
  const suffix = (list) => list.some((s) => host.endsWith(s));

  let tier = "unknown";
  if (suffix(OFFICIAL_SUFFIXES) || match(OFFICIAL_HOSTS)) tier = "primary_official";
  else if (match(RESEARCH_HOSTS) || suffix(RESEARCH_SUFFIXES)) tier = "primary_research";
  else if (match(NEWS_HOSTS)) tier = "established_news";
  else if (match(REFERENCE_HOSTS)) tier = "reference";
  else if (match(WEAK_HOSTS)) tier = "weak";

  return { url, host, tier, ...TIERS[tier] };
}

/**
 * The verdict, from the graded sources alone.
 *
 *   sourced   — at least one primary source, or two independent newsrooms
 *   weak      — something accountable, but nothing primary
 *   untraceable — nothing but self-published or unclassified results, or none at all
 */
export function verdictFor(sources) {
  const graded = sources.map((s) => (s.tier ? s : classifySource(s.url)));

  const primary = graded.filter((s) => s.tier === "primary_official" || s.tier === "primary_research");
  const news = graded.filter((s) => s.tier === "established_news");
  const reference = graded.filter((s) => s.tier === "reference");
  const independentNews = new Set(news.map((s) => s.host)).size;

  if (primary.length >= 1) {
    return {
      verdict: "sourced",
      label: "Sourced",
      reason: `Traced to ${primary.length} primary source${primary.length === 1 ? "" : "s"} (${primary
        .map((s) => s.host)
        .slice(0, 2)
        .join(", ")}).`,
      graded,
    };
  }
  if (independentNews >= 2) {
    return {
      verdict: "sourced",
      label: "Sourced",
      reason: `Reported independently by ${independentNews} established newsrooms, though no primary record was found.`,
      graded,
    };
  }
  if (news.length >= 1 || reference.length >= 1) {
    return {
      verdict: "weak",
      label: "Weakly sourced",
      reason:
        news.length >= 1
          ? "One newsroom carries it, but nothing primary and no independent confirmation."
          : "Only a tertiary reference carries it. That summarises other sources rather than being one.",
      graded,
    };
  }
  return {
    verdict: "untraceable",
    label: "Untraceable",
    reason: graded.length
      ? "Every result was self-published, user-generated, or unclassified. No accountable origin found."
      : "Search returned nothing usable for this claim.",
    graded,
  };
}

/**
 * Guard against the failure mode this whole category of tool has: a model
 * citing a URL that was never in the search results.
 *
 * Only URLs the search tool actually returned are allowed through.
 */
export function retainRealSources(citedUrls, searchResultUrls) {
  const real = new Set(searchResultUrls.map((u) => u.trim()));
  const kept = [];
  const rejected = [];
  for (const url of citedUrls) {
    if (real.has(url.trim())) kept.push(url);
    else rejected.push(url);
  }
  return { kept, rejected };
}
