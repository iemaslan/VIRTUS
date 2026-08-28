/**
 * A scripted talk, for when the room's microphone is not usable.
 *
 * It is labelled as scripted everywhere it appears. The real input path is the
 * microphone, and the paste box takes a real transcript; this exists so a dead
 * mic on stage does not become a dead demo.
 */

export const SAMPLE_LABEL = "Scripted sample — written for this demo, not a recording of a real talk";

export const SAMPLE_TALK = [
  "So the architecture we landed on has three parts.",
  "The front end calls an API that we deploy as a serverless function on the edge, which keeps latency under a hundred milliseconds for most users.",
  "Behind that we run a RAG pipeline.",
  "We chunk the documents, compute an embedding for each chunk, and store them in a vector database.",
  "At query time we retrieve the closest chunks and put them in the context window before the LLM ever sees the question.",
  "That matters because it cuts hallucination substantially, and it also means we are not paying to fine tune anything.",
  "We watch p95 latency rather than the average, because the average hides the tail that users actually complain about.",
  "Everything goes through CI, and we ship behind a feature flag so a regression can be turned off without a redeploy.",
  "One thing we got wrong early was idempotency.",
  "Our webhook handler was not idempotent, so a retry created duplicate records, and that was a genuinely painful race condition to track down.",
];
