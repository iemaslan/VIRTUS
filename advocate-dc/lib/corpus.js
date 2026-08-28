/**
 * The legal source data, and the retrieval built on top of it.
 *
 * `data/dcTenantLaw.json` is the single source of truth for what this system is
 * allowed to say about the law. Swapping that file for another jurisdiction's —
 * or another domain's, such as medical billing or consumer complaints — changes
 * what the product does without changing a line of the pipeline.
 */

import corpus from "../data/dcTenantLaw.json";
import { selectProvisions } from "./retrieval.js";

export const CORPUS = corpus;

/** Agent 2. Deterministic: same input, same provisions, every time. */
export function retrieveProvisions({ category, text }) {
  return selectProvisions(corpus, { category, text });
}

export function getProvision(id) {
  return corpus.find((entry) => entry.id === id) || null;
}
