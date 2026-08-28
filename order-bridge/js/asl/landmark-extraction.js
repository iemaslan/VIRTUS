// ---------------------------------------------------------------------------
// Samples multiple frames — either seeking through a prerecorded <video>
// (extractLandmarkSequence, used by Video Input / calibration) or sampling a
// live camera stream at intervals (captureLiveLandmarkSequence, used by Use
// Camera) — and runs hand landmark detection on each one. Either way, a
// video is NOT treated as a single still image — this is what preserves
// sequence/movement information over time.
//
// Both paths share the same per-frame detection logic (landmarksFromDetection)
// so a live-captured sequence and an uploaded-video sequence come out in
// exactly the same shape before normalization/recognition — there is only
// one recognition pipeline, just two frame sources feeding it.
//
// Each sampled frame is returned as { left, right } (each either a 21-point
// landmark array or null), using MediaPipe's handedness classification so
// the two hands stay in a consistent slot across frames. A frame with no
// detected hands at all is returned as null.
// ---------------------------------------------------------------------------
const DEFAULT_FRAME_COUNT = 24;
const DEFAULT_LIVE_DURATION_MS = 5000; // ~5s, within the 4–6s target window
const DEFAULT_LIVE_SAMPLE_INTERVAL_MS = 100; // ~10 frames/sec

export async function extractLandmarkSequence(
  videoEl,
  handLandmarker,
  { frameCount = DEFAULT_FRAME_COUNT } = {}
) {
  const duration = videoEl.duration;
  if (!isFinite(duration) || duration <= 0) {
    throw new Error("Video has no usable duration.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width === 0 || canvas.height === 0) {
    throw new Error("Video has no usable frame dimensions.");
  }

  const wasPlaying = !videoEl.paused;
  videoEl.pause();

  const frames = [];
  const steps = Math.max(frameCount - 1, 1);

  for (let i = 0; i < frameCount; i++) {
    const time = (duration * i) / steps;
    await seekVideo(videoEl, Math.min(time, duration));
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

    const result = handLandmarker.detect(canvas);
    frames.push(landmarksFromDetection(result));
  }

  if (wasPlaying) {
    videoEl.play().catch(() => {});
  }

  return frames;
}

// Samples a live <video> (playing a getUserMedia camera stream) at a fixed
// interval for a fixed duration. Produces frames in the exact same
// { left, right } | null shape as extractLandmarkSequence above.
export async function captureLiveLandmarkSequence(
  videoEl,
  handLandmarker,
  {
    durationMs = DEFAULT_LIVE_DURATION_MS,
    sampleIntervalMs = DEFAULT_LIVE_SAMPLE_INTERVAL_MS,
    onFrame
  } = {}
) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create a drawing context for camera frames.");
  }

  const frames = [];
  const startTime = performance.now();

  while (performance.now() - startTime < durationMs) {
    if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
      if (canvas.width !== videoEl.videoWidth || canvas.height !== videoEl.videoHeight) {
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
      }
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

      const result = handLandmarker.detect(canvas);
      const frame = landmarksFromDetection(result);
      frames.push(frame);
      if (onFrame) onFrame(frame, frames.length);
    }

    await wait(sampleIntervalMs);
  }

  return frames;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function landmarksFromDetection(result) {
  if (!result || !result.landmarks || result.landmarks.length === 0) {
    return null;
  }

  const hands = { left: null, right: null };

  result.landmarks.forEach((landmarks, i) => {
    const category =
      result.handedness && result.handedness[i] && result.handedness[i][0];
    const side = category && category.categoryName === "Left" ? "left" : "right";
    // If a slot is somehow already filled (e.g. two "Right" reads), keep the
    // first and drop the extra rather than overwriting useful data.
    if (!hands[side]) hands[side] = landmarks;
  });

  if (!hands.left && !hands.right) return null;
  return hands;
}

function seekVideo(videoEl, time) {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      videoEl.removeEventListener("seeked", onSeeked);
      videoEl.removeEventListener("error", onError);
      resolve();
    };
    const onError = (event) => {
      videoEl.removeEventListener("seeked", onSeeked);
      videoEl.removeEventListener("error", onError);
      reject(event);
    };
    videoEl.addEventListener("seeked", onSeeked);
    videoEl.addEventListener("error", onError);
    videoEl.currentTime = time;
  });
}
