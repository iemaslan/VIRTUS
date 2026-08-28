/**
 * Explanations composed in code, for when no API key is configured.
 *
 * They read like a template because they are one. Every fact in them comes from
 * the diff engine and the impact scorer, so the demo is honest and the tool
 * still runs end to end on a laptop with no key and no network.
 */

import { SIGNALS } from "./impact.js";

const DIRECTION_BY_TYPE = {
  removed: "worse_for_you",
  added: "worse_for_you",
  modified: "neutral",
  moved: "neutral",
};

const SIGNAL_PHRASE = Object.fromEntries(
  SIGNALS.map((s) => [s.id, s.label.toLowerCase()])
);

export function composeExplanations(rankedChanges) {
  return {
    document_summary:
      `${rankedChanges.length} substantive change${rankedChanges.length === 1 ? "" : "s"} were found between the two versions. ` +
      "Explanations below are generated in code because no model key is configured.",
    explanations: rankedChanges.map((change) => {
      const source = change.after || change.before;
      const signals = change.impact.signals.map((s) => SIGNAL_PHRASE[s.id]).filter(Boolean);

      const headline =
        change.type === "added"
          ? "A new rule was added"
          : change.type === "removed"
          ? "A rule was taken out"
          : change.type === "moved"
          ? "A rule moved position"
          : "An existing rule was rewritten";

      const consequence = signals.length
        ? `This one ${signals.slice(0, 2).join(" and ")}.`
        : "This is a wording change with no cost, deadline, or rights language in it.";

      return {
        change_id: change.id,
        headline,
        what_it_means: `${consequence} Read the highlighted text to see exactly what moved.`,
        who_is_affected: "Anyone this document applies to",
        direction: DIRECTION_BY_TYPE[change.type] || "neutral",
        quote: source.text.split(/\s+/).slice(0, 12).join(" "),
      };
    }),
  };
}
