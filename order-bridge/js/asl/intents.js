// ---------------------------------------------------------------------------
// Single source of truth for the supported restaurant intents and the
// confidence threshold, shared by every UI that consumes recognition
// results (Video Input, Use Camera, the calibration test tool).
// ---------------------------------------------------------------------------
export const CONFIDENCE_THRESHOLD = 0.55;

export const LABEL_PHRASES = {
  burger: "I would like a burger.",
  burger_no_tomato: "I would like a burger with no tomato.",
  water: "I would like water.",
  yes: "Yes.",
  no: "No."
};
