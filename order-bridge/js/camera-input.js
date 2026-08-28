// ---------------------------------------------------------------------------
// Wires the customer-facing "Use Camera" live-signing widget to the SAME
// ASL recognition pipeline used by Video Input (js/asl/*) — same landmark
// detection logic, same normalization, same recognizer, same Phase 3.5
// templates, same customer-message/speech-synthesis reuse. The only thing
// specific to this module is capturing frames from a live getUserMedia
// stream instead of seeking through an uploaded file.
// ---------------------------------------------------------------------------
import { getHandLandmarker } from "./asl/mediapipe-loader.js";
import { captureLiveLandmarkSequence } from "./asl/landmark-extraction.js";
import { normalizeSequence } from "./asl/normalize.js";
import { recognizeIntent } from "./asl/recognize.js";
import { loadTemplates } from "./asl/templates.js";
import { CONFIDENCE_THRESHOLD, LABEL_PHRASES } from "./asl/intents.js";

const CAPTURE_DURATION_MS = 5000; // ~5s, within the 4–6s target window
const CAPTURE_SAMPLE_INTERVAL_MS = 100; // ~10 frames/sec

const startCameraBtnEl = document.getElementById("startCameraBtn");
const previewEl = document.getElementById("cameraPreview");
const guidanceEl = document.getElementById("cameraGuidance");
const statusEl = document.getElementById("cameraStatus");
const startSigningBtnEl = document.getElementById("startSigningBtn");
const resultEl = document.getElementById("cameraResult");
const stopCameraBtnEl = document.getElementById("stopCameraBtn");

const recognizedAslLabelEl = document.getElementById("recognizedAslLabel");
const customerMessageDisplayEl = document.getElementById("customerMessageDisplayText");
const customerMessageEl = document.getElementById("customerMessageText");
const sendMessageBtnEl = document.getElementById("sendMessageBtn");

if (
  startCameraBtnEl &&
  previewEl &&
  guidanceEl &&
  statusEl &&
  startSigningBtnEl &&
  resultEl &&
  stopCameraBtnEl
) {
  let templatesPromise = null;
  function getTemplates() {
    if (!templatesPromise) templatesPromise = loadTemplates();
    return templatesPromise;
  }

  let mediaStream = null;
  let isCapturing = false;

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function resetResult() {
    resultEl.hidden = true;
    resultEl.textContent = "";
  }

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    previewEl.srcObject = null;
    previewEl.hidden = true;
    guidanceEl.hidden = true;
    startSigningBtnEl.hidden = true;
    stopCameraBtnEl.hidden = true;
    startCameraBtnEl.hidden = false;
    resetResult();
    setStatus("Camera permission required");
  }

  startCameraBtnEl.addEventListener("click", async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus(
        "Camera access is required for live ASL recognition. You can still use Video Input, Type a Message, or Common Requests."
      );
      return;
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (err) {
      setStatus(
        "Camera access is required for live ASL recognition. You can still use Video Input, Type a Message, or Common Requests."
      );
      return;
    }

    previewEl.srcObject = mediaStream;
    previewEl.hidden = false;
    guidanceEl.hidden = false;
    startCameraBtnEl.hidden = true;
    stopCameraBtnEl.hidden = false;

    setStatus("Camera ready");
    setTimeout(() => setStatus("Start signing when ready"), 500);

    startSigningBtnEl.hidden = false;
  });

  stopCameraBtnEl.addEventListener("click", stopCamera);

  startSigningBtnEl.addEventListener("click", async () => {
    if (isCapturing || !mediaStream) return;
    isCapturing = true;
    startSigningBtnEl.disabled = true;
    resetResult();

    try {
      setStatus("Listening for ASL...");

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
        frames = await captureLiveLandmarkSequence(previewEl, handLandmarker, {
          durationMs: CAPTURE_DURATION_MS,
          sampleIntervalMs: CAPTURE_SAMPLE_INTERVAL_MS
        });
      } catch (err) {
        setStatus(
          "No hands were detected clearly. Please try again and keep your hands visible in the camera."
        );
        return;
      }

      const detectedFrames = frames.filter((frame) => frame !== null);
      if (detectedFrames.length === 0) {
        setStatus(
          "No hands were detected clearly. Please try again and keep your hands visible in the camera."
        );
        return;
      }

      setStatus("Hands detected");

      const flatSequence = normalizeSequence(frames);

      setStatus("Analyzing...");

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
        setStatus("Recognized");
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
          "Unable to confidently recognize this signing. Please try again or use another communication option."
        );
      }
    } finally {
      isCapturing = false;
      startSigningBtnEl.disabled = false;
    }
  });

  // A typed message sent afterwards is not ASL-sourced, so clear the tag.
  if (sendMessageBtnEl && recognizedAslLabelEl) {
    sendMessageBtnEl.addEventListener("click", () => {
      recognizedAslLabelEl.hidden = true;
    });
  }

  // Release the camera if the customer navigates away mid-session.
  window.addEventListener("beforeunload", () => {
    if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
  });
}
