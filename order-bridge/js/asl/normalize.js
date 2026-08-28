// ---------------------------------------------------------------------------
// Normalizes raw MediaPipe hand landmarks so recognition isn't sensitive to
// where the customer stands in frame, hand position, hand size, camera
// distance, or minor framing differences between clips.
//
// Reference point: the wrist (landmark 0) is translated to the origin.
// Scale: distance from the wrist to the middle-finger MCP joint (landmark 9),
// a stable, roughly hand-size-proportional distance.
//
// Each frame is flattened into a fixed 126-value vector — 63 values (21
// landmarks x,y,z) for the left hand followed by 63 for the right hand — so
// one- and two-handed frames compare on equal footing. A missing hand is
// zero-filled rather than dropped, which keeps sequence timing intact.
// ---------------------------------------------------------------------------
const WRIST_INDEX = 0;
const SCALE_REFERENCE_INDEX = 9; // middle finger MCP joint
const LANDMARK_COUNT = 21;
const HAND_FEATURE_SIZE = LANDMARK_COUNT * 3; // 63

export function normalizeLandmarks(landmarks) {
  if (!landmarks || landmarks.length === 0) return null;

  const wrist = landmarks[WRIST_INDEX];
  const scaleRef = landmarks[SCALE_REFERENCE_INDEX];
  const scale =
    Math.hypot(
      scaleRef.x - wrist.x,
      scaleRef.y - wrist.y,
      scaleRef.z - wrist.z
    ) || 1;

  return landmarks.map((point) => ({
    x: (point.x - wrist.x) / scale,
    y: (point.y - wrist.y) / scale,
    z: (point.z - wrist.z) / scale
  }));
}

function flattenLandmarks(landmarks) {
  const flat = [];
  for (const point of landmarks) {
    flat.push(point.x, point.y, point.z);
  }
  return flat;
}

function flattenHand(landmarks) {
  if (!landmarks) return new Array(HAND_FEATURE_SIZE).fill(0);
  return flattenLandmarks(normalizeLandmarks(landmarks));
}

// Drops frames with no detected hands at all, and turns every remaining
// frame into a flat [left(63), right(63)] feature vector ready for sequence
// comparison (e.g. DTW) in recognize.js.
export function normalizeSequence(frames) {
  return frames
    .filter((frame) => frame !== null)
    .map((frame) => [...flattenHand(frame.left), ...flattenHand(frame.right)]);
}
