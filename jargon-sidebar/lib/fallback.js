/**
 * What the sidebar says about a term when there is no model to define it.
 *
 * The term is still shown, because the useful half of the job — noticing that
 * a word went past that the listener may not know — is done in code and does
 * not need a key. What is missing is stated rather than papered over.
 */

export function undefinedCard(term) {
  return {
    term,
    short: "Caught, but not defined — no model key is configured.",
    in_context: "The term was detected in the transcript. Add an API key to get a definition.",
    category: "other",
    source: "none",
  };
}
