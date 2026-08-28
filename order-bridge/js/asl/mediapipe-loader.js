// ---------------------------------------------------------------------------
// Loads MediaPipe's HandLandmarker (Tasks Vision) from a CDN and caches the
// instance. This is the only module that knows about MediaPipe specifically —
// everything downstream just consumes plain landmark arrays.
// ---------------------------------------------------------------------------
const TASKS_VISION_VERSION = "0.10.14";
const VISION_BUNDLE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/vision_bundle.mjs`;
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let landmarkerPromise = null;

// Frames are extracted one at a time from a seeked <video>/<canvas>, so IMAGE
// mode (detect) is used rather than VIDEO mode (which requires monotonically
// increasing timestamps from a live stream).
export function getHandLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { HandLandmarker, FilesetResolver } = await import(
        /* webpackIgnore: true */ VISION_BUNDLE_URL
      );
      const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
      return HandLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "IMAGE",
        numHands: 2
      });
    })().catch((err) => {
      landmarkerPromise = null; // allow retrying on a later attempt
      throw err;
    });
  }
  return landmarkerPromise;
}
