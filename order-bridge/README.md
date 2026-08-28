# Order Bridge

A two-way accessibility tool for counter-service environments. A Deaf or non-speaking customer communicates through ASL (live camera or uploaded video), typed text, or quick-request buttons; the hearing cashier communicates in English (typed/spoken responses play back as prerecorded ASL video). Everything reaches the other side as plain English text and/or speech.

Built for DevFest DC 2026, Build Edition — part of the [VIRTUS](../README.md) monorepo.

## What it does

- **Cashier → Customer:** Cashier speaks or clicks a phrase ("Do you need help?", "Anything else?", "Thank you", "Have a good day") and the matching prerecorded ASL video plays for the customer, with live speech-recognition phrase matching for natural spoken input.
- **Customer → Cashier (multiple input methods):**
  - **Use Camera** — live webcam ASL recognition via MediaPipe Hand Landmarker, matched against real calibrated example templates (Dynamic Time Warping nearest-template matching).
  - **Video Input** — same recognition pipeline, applied to an uploaded video clip instead of a live stream (useful for testing / as an alternative input).
  - **Type a Message** — free text, optionally read aloud via speech synthesis.
  - **Common Requests** — one-tap buttons for frequent orders (Burger, Fries, Water, Drink, To Go).
- **Order Total** — cashier enters a total, customer sees a large formatted display.
- Currently calibrated ASL intent: `burger_no_tomato` ("I would like a burger with no tomato."). Recognition is intentionally constrained to a small, calibrated vocabulary — it does not claim to understand open-ended ASL.

## Tech

Plain HTML/CSS/JavaScript, no build step, no backend, no framework. ASL hand-landmark detection via [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) (loaded from CDN). Speech recognition/synthesis via the browser's native Web Speech API. Recognition templates are real MediaPipe output from recorded example clips (see `training/`), not fabricated data.

## Run instructions

No build step, no install. From inside this directory, serve the folder as static files and open `index.html` (a plain `file://` open won't run the ES module scripts, so use a local server):

```bash
cd order-bridge
python -m http.server 8000
```

Then open `http://localhost:8000/index.html`.

Requires a Chromium-based browser (Chrome/Edge) for the Web Speech API (speech recognition) and camera/microphone permissions.

## Deploying

Same pattern as the repo's other projects: import into Vercel with **Root Directory** set to `order-bridge`. It's a static site (`vercel.json` sets `framework: null`) — no build command needed.

### Developer calibration tool

`calibration.html` is a separate, developer-only page (not linked from the main app) for generating recognition template data from example clips. See its on-page instructions.

## Project structure

```
index.html              Main customer/cashier app
calibration.html        Developer-only calibration tool
css/styles.css
js/app.js                Cashier response videos, customer common requests, Order Total, Type a Message
js/video-input.js        Wires uploaded-video ASL recognition to the pipeline below
js/camera-input.js       Wires live-camera ASL recognition to the same pipeline
js/calibration.js        Developer calibration tool logic
js/asl/                  Recognition pipeline: MediaPipe loading, landmark extraction/normalization,
                          DTW-based recognition, intent/template definitions
assets/asl-responses/    Prerecorded cashier ASL response videos
data/                    Generated recognition template JSON (from real calibration clips)
training/                Real example clips used to generate the templates above
```
