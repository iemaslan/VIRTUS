/**
 * A curated glossary, so the common case never waits on a network call.
 *
 * A sidebar that appears four seconds after the speaker moved on is not a
 * sidebar, it is a transcript. Terms that turn up in almost every technical
 * talk are defined here, in code, and render the instant they are heard. The
 * model is reserved for the terms a glossary cannot anticipate.
 */

export const GLOSSARY = {
  api: "A defined way for one program to call another.",
  sdk: "A packaged set of tools and libraries for building against a service.",
  cli: "A command-line program, driven by typed commands rather than a screen.",
  llm: "A large language model — a model trained to predict and generate text.",
  rag: "Retrieval-augmented generation: fetch relevant documents first, then answer from them.",
  embedding: "Text turned into a list of numbers, so similar meanings sit close together.",
  "vector database": "A store that finds records by similarity of meaning rather than exact match.",
  token: "The unit a language model reads and writes — roughly a word piece.",
  "context window": "How much text a model can consider at once.",
  inference: "Running a trained model to get an answer, as opposed to training it.",
  "fine tuning": "Further training a model on your own examples to change its behaviour.",
  prompt: "The instructions and input given to a model.",
  "prompt injection": "Hidden text that tries to hijack an AI agent reading a page or document.",
  hallucination: "A model stating something fluent and false.",
  latency: "How long one request takes to come back.",
  throughput: "How much work a system gets through per unit of time.",
  cache: "A copy kept close by so the slow original does not have to be fetched again.",
  cdn: "A network of servers near users that serves content faster than the origin.",
  "edge function": "Code that runs on servers close to the user rather than in one region.",
  serverless: "Code that runs on demand, without you managing the machine it runs on.",
  container: "A packaged application with its dependencies, run in isolation.",
  kubernetes: "A system that schedules and manages containers across many machines.",
  ci: "Continuous integration — automatic build and test on every change.",
  "ci/cd": "Automatic build, test, and release on every change.",
  webhook: "An HTTP call a service makes to you when something happens.",
  idempotent: "Safe to repeat — running it twice has the same effect as running it once.",
  "race condition": "A bug where the result depends on which of two things finishes first.",
  "technical debt": "Shortcuts taken now that cost more time later.",
  "schema": "The declared shape of data — the fields, their types, and what is required.",
  "orm": "A layer that maps database rows to objects in your code.",
  "sql": "The query language used to read and write relational databases.",
  "postgres": "A widely used open-source relational database.",
  "oauth": "A standard that lets you grant an app access without giving it your password.",
  jwt: "A signed token carrying claims about who the bearer is.",
  "rate limit": "A cap on how many requests you may make in a period.",
  "load balancer": "A component that spreads incoming requests across several servers.",
  "a/b test": "Showing two versions to different users to see which performs better.",
  "p95": "The value 95 percent of measurements fall under — a tail-latency measure.",
  slo: "A target a service commits to, such as 99.9 percent availability.",
  "observability": "Being able to tell what a running system is doing from its output.",
  telemetry: "The metrics, logs, and traces a system emits about itself.",
  "feature flag": "A switch that turns behaviour on or off without redeploying.",
  "monorepo": "One repository holding several projects.",
  "pull request": "A proposed change to a codebase, opened for review.",
  regression: "Something that used to work and no longer does.",
  refactor: "Restructuring code without changing what it does.",
  "agent": "A program that plans and takes actions with tools, rather than answering once.",
  "tool call": "A model asking the surrounding program to run a specific function.",
  "multimodal": "Handling more than one kind of input, such as text and images.",
  quantization: "Shrinking a model by storing its numbers at lower precision.",
  "open weights": "A model whose trained parameters are published for anyone to run.",
  benchmark: "A fixed set of tasks used to compare systems.",
  "provenance": "The recorded history of where a file came from and how it was changed.",
  c2pa: "A standard for attaching tamper-evident origin data to media files.",
  exif: "Metadata a camera writes into an image, such as time and device.",
  "zero trust": "A security model that verifies every request instead of trusting the network.",
  "sso": "Single sign-on — one login that grants access to many applications.",
  "dns": "The system that turns a hostname into an IP address.",
  "tls": "The encryption layer that makes HTTPS private and authenticated.",
};

/** Terms that also read as ordinary English, so they only count with technical company. */
export const AMBIGUOUS = new Set(["token", "agent", "cache", "schema", "container", "prompt"]);

export function lookup(term) {
  return GLOSSARY[String(term || "").toLowerCase().trim()] || null;
}

export const GLOSSARY_TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
