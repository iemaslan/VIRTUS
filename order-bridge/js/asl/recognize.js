// ---------------------------------------------------------------------------
// Sign classification via nearest-template matching using Dynamic Time
// Warping (DTW) to compare the input landmark sequence against stored
// example sequences per label. Deliberately lightweight — no training, no
// neural network — appropriate for distinguishing a handful of signs.
//
// This module does NOT know about the UI, the video element, or MediaPipe.
// It only compares arrays of numbers.
// ---------------------------------------------------------------------------

function frameDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Classic DTW: cheapest alignment path between two sequences of feature
// vectors, normalized by path length so longer clips aren't unfairly
// penalized against shorter templates.
export function dtwDistance(seqA, seqB) {
  const n = seqA.length;
  const m = seqB.length;
  if (n === 0 || m === 0) return Infinity;

  const dp = [];
  for (let i = 0; i <= n; i++) {
    dp.push(new Array(m + 1).fill(Infinity));
  }
  dp[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = frameDistance(seqA[i - 1], seqB[j - 1]);
      dp[i][j] = cost + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[n][m] / (n + m);
}

// templates: { burger: [flatSequence, ...], burger_no_tomato: [...],
//              water: [...], yes: [...], no: [...] }
// Returns { label, confidence } — label is null when there is nothing to
// compare against, or when nothing resembles the input closely enough for
// the caller's confidence threshold to accept.
export function recognizeIntent(flatSequence, templates) {
  const labels = Object.keys(templates || {}).filter(
    (label) => Array.isArray(templates[label]) && templates[label].length > 0
  );

  if (labels.length === 0 || !flatSequence || flatSequence.length === 0) {
    return { label: null, confidence: 0 };
  }

  let bestLabel = null;
  let bestDistance = Infinity;

  for (const label of labels) {
    for (const templateSeq of templates[label]) {
      const distance = dtwDistance(flatSequence, templateSeq);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestLabel = label;
      }
    }
  }

  if (bestLabel === null || !isFinite(bestDistance)) {
    return { label: null, confidence: 0 };
  }

  // Smaller DTW distance -> higher confidence, mapped into (0, 1].
  const confidence = 1 / (1 + bestDistance);

  return { label: bestLabel, confidence };
}
