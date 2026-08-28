// ---------------------------------------------------------------------------
// Loads normalized landmark-sequence templates for the supported restaurant
// intents from data/<label>.json, produced by the calibration tool
// (calibration.html) in Phase 3.5.
//
// If a file is missing, that label is simply left out of the returned map —
// recognition never fabricates a match for an intent with no real examples.
//
// Expected file contents (produced by calibration.html):
//   { "label": "burger_no_tomato", "templates": [ [...seq1...], [...seq2...] ] }
// where each sequence is an array of per-frame feature vectors, as produced
// by normalizeSequence in normalize.js. A bare JSON array of sequences is
// also accepted for backward compatibility.
// ---------------------------------------------------------------------------
const TEMPLATE_LABELS = ["burger", "burger_no_tomato", "water", "yes", "no"];

export async function loadTemplates() {
  const templates = {};

  await Promise.all(
    TEMPLATE_LABELS.map(async (label) => {
      try {
        const response = await fetch(`data/${label}.json`);
        if (!response.ok) return;
        const data = await response.json();

        let sequences;
        if (Array.isArray(data)) {
          sequences = data;
        } else if (data && Array.isArray(data.templates)) {
          sequences = data.templates;
        } else {
          sequences = [];
        }

        if (sequences.length > 0) {
          templates[label] = sequences;
        }
      } catch (err) {
        // No template data available yet for this label — recognition for
        // it stays unavailable until data/<label>.json is added via the
        // calibration tool. This is expected, not an error to surface.
      }
    })
  );

  return templates;
}
