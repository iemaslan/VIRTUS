/**
 * Zero dependencies, no network, no API key. `node --test test/*.test.mjs`.
 *
 * These cover the half of the product that is code: which words count as
 * jargon, and the guard that stops a definition for a term nobody said from
 * reaching the screen.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { detectTerms, splitSentences, acceptDefinitions, normalize } from "../lib/detect.js";
import { lookup, GLOSSARY } from "../lib/glossary.js";

test("a glossary term is caught and comes back with its definition already attached", () => {
  const found = detectTerms("We store them in a vector database and query it later.");
  const hit = found.find((f) => f.term === "vector database");
  assert.ok(hit, "vector database should be detected");
  assert.equal(hit.source, "glossary");
  assert.equal(hit.definition, GLOSSARY["vector database"]);
});

test("the longest reading wins — a term is not reported again as its own fragment", () => {
  const found = detectTerms("Everything ships through ci/cd before release.");
  const terms = found.map((f) => f.term);
  assert.ok(terms.includes("ci/cd"));
  assert.ok(!terms.includes("ci"), "ci must not be reported separately inside ci/cd");
});

test("an unknown acronym is caught even though no glossary entry exists", () => {
  const found = detectTerms("The whole thing runs on GPUs behind a queue.");
  const hit = found.find((f) => f.term === "GPUS" || f.term === "GPU");
  assert.ok(hit, "an unfamiliar acronym should be detected");
  assert.equal(hit.source, "acronym");
  assert.equal(hit.definition, null);
});

test("acronyms that are ordinary English are left alone", () => {
  const found = detectTerms("OK so THE answer is A, and I agree.");
  const terms = found.map((f) => f.term);
  for (const noise of ["OK", "THE", "A", "I"]) {
    assert.ok(!terms.includes(noise), `${noise} should not be treated as jargon`);
  }
});

test("a word that is also plain English only counts in technical company", () => {
  const plain = detectTerms("She was a strong agent for the family.");
  assert.ok(!plain.some((f) => f.term === "agent"), "no technical context, so not jargon");

  const technical = detectTerms("The agent makes a tool call against our API.");
  assert.ok(technical.some((f) => f.term === "agent"), "technical context, so jargon");
});

test("a term already on screen is never added a second time", () => {
  const known = new Set(["latency"]);
  const found = detectTerms("Our latency went up sharply.", { known });
  assert.ok(!found.some((f) => f.term === "latency"));
});

test("every detected term carries the sentence it was actually said in", () => {
  const found = detectTerms("First we chunk it. Then we compute an embedding for each chunk.");
  const hit = found.find((f) => f.term === "embedding");
  assert.ok(hit);
  assert.match(hit.sentence, /compute an embedding/);
  assert.ok(!hit.sentence.includes("First we chunk"), "the wrong sentence must not be attached");
});

test("a definition for a term nobody said is rejected", () => {
  const { accepted, rejected } = acceptDefinitions(
    [
      { term: "RAG", short: "Retrieval-augmented generation." },
      { term: "Kubernetes", short: "A thing the speaker never mentioned." },
    ],
    ["RAG"]
  );
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].term, "RAG");
  assert.deepEqual(rejected, ["Kubernetes"]);
});

test("a definition is matched to its term regardless of casing", () => {
  const { accepted } = acceptDefinitions([{ term: "rag", short: "..." }], ["RAG"]);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].term, "RAG", "the term is returned as it was detected");
});

test("live speech without final punctuation still splits into sentences", () => {
  const sentences = splitSentences("We deploy on the edge. Then we measure p95");
  assert.equal(sentences.length, 2);
  assert.match(sentences[1], /p95/);
});

test("empty and junk input do not throw", () => {
  assert.deepEqual(detectTerms(""), []);
  assert.deepEqual(detectTerms(null), []);
  assert.deepEqual(splitSentences(undefined), []);
  assert.equal(normalize(null), "");
  assert.equal(lookup("nothing-like-this"), null);
});
