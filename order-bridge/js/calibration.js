// ---------------------------------------------------------------------------
// Developer-only calibration tool (Phase 3.5 preparation). Reuses the exact
// same pipeline modules as the customer-facing Video Input flow — this file
// only adds the developer workflow of collecting labeled examples and
// exporting them as data/<label>.json template files.
// ---------------------------------------------------------------------------
import { getHandLandmarker } from "./asl/mediapipe-loader.js";
import { extractLandmarkSequence } from "./asl/landmark-extraction.js";
import { normalizeSequence } from "./asl/normalize.js";
import { recognizeIntent } from "./asl/recognize.js";
import { loadTemplates } from "./asl/templates.js";

// ---------------------------------------------------------------------------
// Section 1 (Phase 3.5): calibrate burger_no_tomato from the three known
// training clips in training/burger_no_tomato/. These fixed paths are only
// used to LOCATE the known training examples for this one-time calibration
// run — recognition itself (recognize.js) never inspects filenames.
// ---------------------------------------------------------------------------
const BNT_LABEL = "burger_no_tomato";
const BNT_TRAINING_PATHS = [
  "training/burger_no_tomato/burger_no_tomato_1.mp4",
  "training/burger_no_tomato/burger_no_tomato_2.mp4",
  "training/burger_no_tomato/burger_no_tomato_3.mp4"
];

const bntRunBtn = document.getElementById("calibRunBntBtn");
const bntStatusEl = document.getElementById("calibBntStatus");
const bntSummaryEl = document.getElementById("calibBntSummary");
const bntOutputEl = document.getElementById("calibBntOutput");
const bntDownloadBtn = document.getElementById("calibBntDownloadBtn");

let bntGeneratedJson = null;

function setBntStatus(text) {
  bntStatusEl.textContent = text;
}

async function loadVideoFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url} (${response.status})`);
  }
  const blob = await response.blob();
  const video = document.createElement("video");
  video.src = URL.createObjectURL(blob);
  video.muted = true;
  video.playsInline = true;
  await new Promise((resolve, reject) => {
    video.addEventListener("loadedmetadata", resolve, { once: true });
    video.addEventListener("error", reject, { once: true });
  });
  return video;
}

if (bntRunBtn) {
  bntRunBtn.addEventListener("click", async () => {
    bntRunBtn.disabled = true;
    bntSummaryEl.hidden = true;
    bntSummaryEl.innerHTML = "";
    bntOutputEl.value = "";
    bntDownloadBtn.disabled = true;
    bntGeneratedJson = null;

    try {
      setBntStatus("Loading MediaPipe...");
      const handLandmarker = await getHandLandmarker();

      const templates = [];
      const rows = [];

      for (let i = 0; i < BNT_TRAINING_PATHS.length; i++) {
        const path = BNT_TRAINING_PATHS[i];
        setBntStatus(`Processing clip ${i + 1} of ${BNT_TRAINING_PATHS.length}...`);

        const video = await loadVideoFromUrl(path);
        const frames = await extractLandmarkSequence(video, handLandmarker);
        const detected = frames.filter((frame) => frame !== null);

        if (detected.length === 0) {
          rows.push(`<p>${path} &mdash; no hand detected, skipped</p>`);
        } else {
          const flatSequence = normalizeSequence(frames);
          templates.push(flatSequence);
          rows.push(
            `<p>${path} &mdash; ${frames.length} frames processed, ${detected.length} with a detected hand, sequence length ${flatSequence.length}</p>`
          );
        }

        URL.revokeObjectURL(video.src);
      }

      bntSummaryEl.hidden = false;
      bntSummaryEl.innerHTML = rows.join("");

      if (templates.length === 0) {
        setBntStatus(
          "No usable templates were generated — no hand was detected in any training clip."
        );
        return;
      }

      const output = { label: BNT_LABEL, templates };
      bntGeneratedJson = JSON.stringify(output, null, 2);
      bntOutputEl.value = bntGeneratedJson;
      bntDownloadBtn.disabled = false;

      setBntStatus(
        `Done. Generated ${templates.length} of ${BNT_TRAINING_PATHS.length} templates from real training clips.`
      );
    } catch (err) {
      setBntStatus(
        "Calibration failed. Check that the training videos are present at training/burger_no_tomato/."
      );
    } finally {
      bntRunBtn.disabled = false;
    }
  });

  bntDownloadBtn.addEventListener("click", () => {
    if (!bntGeneratedJson) return;
    const blob = new Blob([bntGeneratedJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${BNT_LABEL}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

// ---------------------------------------------------------------------------
// Section 2: record examples (generic, manual — for calibrating other
// intents later)
// ---------------------------------------------------------------------------
const labelSelect = document.getElementById("calibLabelSelect");
const fileInput = document.getElementById("calibFileInput");
const preview = document.getElementById("calibPreview");
const extractBtn = document.getElementById("calibExtractBtn");
const exportBtn = document.getElementById("calibExportBtn");
const clearBtn = document.getElementById("calibClearBtn");
const statusEl = document.getElementById("calibStatus");
const summaryEl = document.getElementById("calibSummary");
const frameCountEl = document.getElementById("calibFrameCount");
const handCountEl = document.getElementById("calibHandCount");
const exampleCountEl = document.getElementById("calibExampleCount");

// label -> array of flat landmark sequences collected this session
const collectedExamples = {};

function setStatus(text) {
  statusEl.textContent = text;
}

function currentLabel() {
  return labelSelect.value;
}

function refreshExampleControls() {
  const examples = collectedExamples[currentLabel()] || [];
  exampleCountEl.textContent = String(examples.length);
  exportBtn.disabled = examples.length === 0;
  clearBtn.disabled = examples.length === 0;
}

labelSelect.addEventListener("change", () => {
  summaryEl.hidden = false;
  refreshExampleControls();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];

  if (!file) {
    preview.hidden = true;
    preview.removeAttribute("src");
    extractBtn.disabled = true;
    return;
  }

  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  extractBtn.disabled = false;
  setStatus(`Selected: ${file.name}`);
});

extractBtn.addEventListener("click", async () => {
  extractBtn.disabled = true;

  try {
    setStatus("Loading MediaPipe...");
    const handLandmarker = await getHandLandmarker();

    setStatus("Extracting landmarks across frames...");
    const frames = await extractLandmarkSequence(preview, handLandmarker);
    const detected = frames.filter((frame) => frame !== null);

    frameCountEl.textContent = String(frames.length);
    handCountEl.textContent = String(detected.length);
    summaryEl.hidden = false;

    if (detected.length === 0) {
      setStatus("No hand detected in this clip. Try a clearer example.");
      return;
    }

    const flatSequence = normalizeSequence(frames);
    const label = currentLabel();
    if (!collectedExamples[label]) collectedExamples[label] = [];
    collectedExamples[label].push(flatSequence);

    refreshExampleControls();
    setStatus(`Example added for "${label}". Select another clip to add more.`);
  } catch (err) {
    setStatus("Could not process this video. Try another file.");
  } finally {
    extractBtn.disabled = false;
  }
});

exportBtn.addEventListener("click", () => {
  const label = currentLabel();
  const examples = collectedExamples[label] || [];
  if (examples.length === 0) return;

  const output = { label, templates: examples };
  const blob = new Blob([JSON.stringify(output, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${label}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

clearBtn.addEventListener("click", () => {
  const label = currentLabel();
  collectedExamples[label] = [];
  refreshExampleControls();
  setStatus(`Cleared collected examples for "${label}".`);
});

refreshExampleControls();

// ---------------------------------------------------------------------------
// Section 3: test an unseen clip against whatever data/*.json templates are
// currently deployed (not the in-session examples above).
// ---------------------------------------------------------------------------
const testFileInput = document.getElementById("calibTestFileInput");
const testPreview = document.getElementById("calibTestPreview");
const testBtn = document.getElementById("calibTestBtn");
const testStatusEl = document.getElementById("calibTestStatus");
const testResultEl = document.getElementById("calibTestResult");

function setTestStatus(text) {
  testStatusEl.textContent = text;
}

testFileInput.addEventListener("change", () => {
  const file = testFileInput.files && testFileInput.files[0];
  testResultEl.hidden = true;

  if (!file) {
    testPreview.hidden = true;
    testPreview.removeAttribute("src");
    testBtn.disabled = true;
    return;
  }

  testPreview.src = URL.createObjectURL(file);
  testPreview.hidden = false;
  testBtn.disabled = false;
  setTestStatus(`Selected: ${file.name}`);
});

testBtn.addEventListener("click", async () => {
  testBtn.disabled = true;
  testResultEl.hidden = true;

  try {
    setTestStatus("Loading MediaPipe...");
    const handLandmarker = await getHandLandmarker();

    setTestStatus("Extracting landmarks...");
    const frames = await extractLandmarkSequence(testPreview, handLandmarker);
    const detected = frames.filter((frame) => frame !== null);

    if (detected.length === 0) {
      setTestStatus("No hand detected in this clip.");
      return;
    }

    const flatSequence = normalizeSequence(frames);

    setTestStatus("Loading deployed templates from data/...");
    const templates = await loadTemplates();

    if (Object.keys(templates).length === 0) {
      setTestStatus("No data/*.json templates are deployed yet.");
      return;
    }

    const result = recognizeIntent(flatSequence, templates);
    setTestStatus("Done.");
    testResultEl.hidden = false;
    testResultEl.textContent = result.label
      ? `Best match: "${result.label}" (confidence ${result.confidence.toFixed(3)})`
      : `No confident match (confidence ${result.confidence.toFixed(3)})`;
  } catch (err) {
    setTestStatus("Could not process this video. Try another file.");
  } finally {
    testBtn.disabled = false;
  }
});
