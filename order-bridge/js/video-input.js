// ---------------------------------------------------------------------------
// Wires the customer-facing "Video Input" widget to the ASL recognition
// pipeline (js/asl/*) and reuses Phase 1/2/2.5's existing customer-message
// and speech-synthesis functions rather than duplicating that logic.
//
// This module only handles UI orchestration — video loading, landmark
// extraction, and intent classification each live in their own module.
// ---------------------------------------------------------------------------
import { getHandLandmarker } from "./asl/mediapipe-loader.js";
import { extractLandmarkSequence } from "./asl/landmark-extraction.js";
import { normalizeSequence } from "./asl/normalize.js";
import { recognizeIntent } from "./asl/recognize.js";
import { loadTemplates } from "./asl/templates.js";
import { CONFIDENCE_THRESHOLD, LABEL_PHRASES } from "./asl/intents.js";

const fileInputEl = document.getElementById("videoInputFile");
const previewEl = document.getElementById("videoInputPreview");
const filenameEl = document.getElementById("videoInputFilename");
const analyzeBtnEl = document.getElementById("analyzeSignBtn");
const statusEl = document.getElementById("videoInputStatus");
const resultEl = document.getElementById("videoInputResult");

const recognizedAslLabelEl = document.getElementById("recognizedAslLabel");
const customerMessageDisplayEl = document.getElementById("customerMessageDisplayText");
const customerMessageEl = document.getElementById("customerMessageText");
const sendMessageBtnEl = document.getElementById("sendMessageBtn");

if (fileInputEl && previewEl && filenameEl && analyzeBtnEl && statusEl && resultEl) {
  let templatesPromise = null;
  function getTemplates() {
    if (!templatesPromise) templatesPromise = loadTemplates();
    return templatesPromise;
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function resetResult() {
    resultEl.hidden = true;
    resultEl.textContent = "";
  }

  fileInputEl.addEventListener("change", () => {
    const file = fileInputEl.files && fileInputEl.files[0];
    resetResult();

    if (!file) {
      previewEl.hidden = true;
      previewEl.removeAttribute("src");
      filenameEl.textContent = "";
      analyzeBtnEl.disabled = true;
      setStatus("Select a short ASL clip to begin.");
      return;
    }

    previewEl.src = URL.createObjectURL(file);
    previewEl.hidden = false;
    filenameEl.textContent = file.name;
    analyzeBtnEl.disabled = false;
    setStatus("Video selected");
  });

  previewEl.addEventListener("loadedmetadata", () => {
    if (!previewEl.hidden) setStatus("Video ready");
  });

  previewEl.addEventListener("error", () => {
    setStatus("This video could not be processed. Please try another file.");
    analyzeBtnEl.disabled = true;
  });

  analyzeBtnEl.addEventListener("click", async () => {
    resetResult();
    analyzeBtnEl.disabled = true;

    try {
      setStatus("Analyzing sign...");

      let handLandmarker;
      try {
        handLandmarker = await getHandLandmarker();
      } catch (err) {
        setStatus(
          "ASL recognition is temporarily unavailable. You can still type a message or use Common Requests."
        );
        return;
      }

      let frames;
      try {
        frames = await extractLandmarkSequence(previewEl, handLandmarker);
      } catch (err) {
        setStatus("This video could not be processed. Please try another file.");
        return;
      }

      const detectedFrames = frames.filter((frame) => frame !== null);
      if (detectedFrames.length === 0) {
        setStatus("No hand was detected clearly. Please try another video.");
        return;
      }

      setStatus("Hand detected");

      const flatSequence = normalizeSequence(frames);

      setStatus("Landmark sequence captured");

      const templates = await getTemplates();
      const hasAnyTemplates = Object.keys(templates).length > 0;

      if (!hasAnyTemplates) {
        setStatus("Recognition calibration required.");
        resultEl.textContent = "Recognition templates have not been calibrated yet.";
        resultEl.hidden = false;
        return;
      }

      const result = recognizeIntent(flatSequence, templates);
      const phrase = result.label && LABEL_PHRASES[result.label];

      if (phrase && result.confidence >= CONFIDENCE_THRESHOLD) {
        setStatus(`Recognized: ${phrase}`);
        resultEl.textContent = `Recognized: ${phrase}`;
        resultEl.hidden = false;

        if (recognizedAslLabelEl) {
          recognizedAslLabelEl.textContent = "Recognized Intent";
          recognizedAslLabelEl.hidden = false;
        }
        // Reuse the existing customer-message and speech-synthesis
        // functions from Phase 1/2/2.5 instead of duplicating that logic.
        if (customerMessageDisplayEl) customerMessageDisplayEl.textContent = phrase;
        if (customerMessageEl) customerMessageEl.textContent = phrase;
        if (typeof window.speak === "function") window.speak(phrase);
      } else {
        setStatus(
          "Unable to confidently recognize this signing. Please try again or use another communication method."
        );
      }
    } catch (err) {
      setStatus("This video could not be processed. Please try another file.");
    } finally {
      analyzeBtnEl.disabled = false;
    }
  });

  // A typed message sent afterwards is not ASL-sourced, so clear the tag.
  if (sendMessageBtnEl && recognizedAslLabelEl) {
    sendMessageBtnEl.addEventListener("click", () => {
      recognizedAslLabelEl.hidden = true;
    });
  }
}
