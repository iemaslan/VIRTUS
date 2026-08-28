/**
 * A tool that labels claims "Sourced" is only worth having if the label means
 * something fixed. These tests pin down what each verdict requires.
 *
 *   npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { triageClaim, buildQuery } from "../lib/triage.js";
import { classifySource, verdictFor, retainRealSources, hostOf } from "../lib/sources.js";

test("a factual claim with a figure is checkable", () => {
  const t = triageClaim("The District raised the security deposit cap to 2400 dollars in 2026.");
  assert.equal(t.kind, "checkable");
  assert.equal(t.searchable, true);
  assert.ok(t.specifics.includes("a figure"));
});

test("a value judgement is not sent to search", () => {
  const t = triageClaim("Washington DC is the best city in America.");
  assert.equal(t.kind, "opinion");
  assert.equal(t.searchable, false);
  assert.match(t.reason, /value judgement/);
});

test("a claim about the future is not sent to search", () => {
  const t = triageClaim("Rents in Navy Yard will be 30 percent higher next year.");
  assert.equal(t.kind, "prediction");
  assert.equal(t.searchable, false);
});

test("an unattributed rumour is not sent to search", () => {
  const t = triageClaim("Some say the programme is being quietly cancelled.");
  assert.equal(t.kind, "hedged");
  assert.equal(t.searchable, false);
});

test("a factual-sounding sentence with nothing specific is not searched", () => {
  const t = triageClaim("the rules changed a while ago and it affects everyone");
  assert.equal(t.kind, "vague");
  assert.equal(t.searchable, false);
});

test("the search query is derived deterministically and stays short", () => {
  const claim = "  And the mayor announced a “45 day” deadline in 2026 " + "word ".repeat(40);
  const query = buildQuery(claim);
  assert.ok(!query.startsWith("And "), "leading conjunction should be dropped");
  assert.ok(!query.includes("“"), "smart quotes should be stripped");
  assert.ok(query.split(" ").length <= 28);
  assert.equal(buildQuery(claim), query, "query building must be reproducible");
});

test("source tiers are assigned by host, including subdomains", () => {
  assert.equal(classifySource("https://www.census.gov/data/tables/x.html").tier, "primary_official");
  assert.equal(classifySource("https://ota.dc.gov/page").tier, "primary_official");
  assert.equal(classifySource("https://doi.org/10.1000/abc").tier, "primary_research");
  assert.equal(classifySource("https://news.mit.edu/thing").tier, "primary_research");
  assert.equal(classifySource("https://www.reuters.com/world/x").tier, "established_news");
  assert.equal(classifySource("https://en.wikipedia.org/wiki/X").tier, "reference");
  assert.equal(classifySource("https://medium.com/@someone/post").tier, "weak");
  assert.equal(classifySource("https://random-blog-42.xyz/post").tier, "unknown");
  assert.equal(classifySource("not a url").tier, "unknown");
});

test("hostOf strips www and survives junk", () => {
  assert.equal(hostOf("https://www.bbc.co.uk/news"), "bbc.co.uk");
  assert.equal(hostOf("nonsense"), null);
});

test("one primary source is enough to be Sourced", () => {
  const v = verdictFor([{ url: "https://www.bls.gov/news.release/x.htm" }]);
  assert.equal(v.verdict, "sourced");
  assert.match(v.reason, /primary source/);
});

test("two independent newsrooms are enough to be Sourced", () => {
  const v = verdictFor([
    { url: "https://www.reuters.com/a" },
    { url: "https://apnews.com/b" },
  ]);
  assert.equal(v.verdict, "sourced");
  assert.match(v.reason, /independently/);
});

test("two links from the same newsroom are not independent confirmation", () => {
  const v = verdictFor([
    { url: "https://www.reuters.com/a" },
    { url: "https://www.reuters.com/b" },
  ]);
  assert.equal(v.verdict, "weak");
});

test("a lone encyclopedia entry is weak, not sourced", () => {
  const v = verdictFor([{ url: "https://en.wikipedia.org/wiki/X" }]);
  assert.equal(v.verdict, "weak");
  assert.match(v.reason, /tertiary/);
});

test("only self-published results means Untraceable", () => {
  const v = verdictFor([
    { url: "https://medium.com/@a/post" },
    { url: "https://x.com/someone/status/1" },
  ]);
  assert.equal(v.verdict, "untraceable");
});

test("no results at all means Untraceable, not an error", () => {
  const v = verdictFor([]);
  assert.equal(v.verdict, "untraceable");
  assert.match(v.reason, /nothing usable/);
});

test("a URL that was never in the search results is discarded", () => {
  const { kept, rejected } = retainRealSources(
    ["https://www.reuters.com/real", "https://www.cdc.gov/invented-by-the-model"],
    ["https://www.reuters.com/real", "https://apnews.com/other"]
  );
  assert.deepEqual(kept, ["https://www.reuters.com/real"]);
  assert.deepEqual(rejected, ["https://www.cdc.gov/invented-by-the-model"]);
});

test("a fabricated source cannot change a verdict", () => {
  const searchReturned = ["https://medium.com/@a/post"];
  const modelCited = ["https://medium.com/@a/post", "https://www.who.int/fabricated"];

  const { kept } = retainRealSources(modelCited, searchReturned);
  const verdict = verdictFor(kept.map((url) => ({ url })));

  assert.equal(verdict.verdict, "untraceable", "the invented WHO link must not upgrade the verdict");
});

test("every graded source carries a tier the reader can see", () => {
  const v = verdictFor([{ url: "https://www.reuters.com/a" }, { url: "https://medium.com/@b/c" }]);
  assert.equal(v.graded.length, 2);
  for (const source of v.graded) {
    assert.ok(source.label && source.note, "each source needs a human-readable tier");
  }
});
