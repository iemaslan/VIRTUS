// ---------------------------------------------------------------------------
// CASHIER -> ASL response video mapping
// Add new phrase/video pairs here; a button is generated for each entry.
// ---------------------------------------------------------------------------
const aslResponses = {
  "do-you-need-help": {
    phrase: "Do you need help?",
    video: "assets/asl-responses/youneedhelp.mp4"
  },

  "anything-else": {
    phrase: "Anything else?",
    video: "assets/asl-responses/anythingelse.mp4"
  },

  "thank-you": {
    phrase: "Thank you",
    video: "assets/asl-responses/thank-you.mp4"
  },

  "have-a-good-day": {
    phrase: "Have a good day",
    video: "assets/asl-responses/haveagoodday.mp4"
  }
};

// ---------------------------------------------------------------------------
// CUSTOMER -> Common Requests mapping
// ---------------------------------------------------------------------------
const customerIntents = {
  burger: { label: "Burger", phrase: "I would like a burger." },
  fries: { label: "Fries", phrase: "I would like fries." },
  water: { label: "Water", phrase: "I would like water." },
  drink: { label: "Drink", phrase: "I would like a drink." },
  togo: { label: "To Go", phrase: "I would like my order to go." }
};

// ---------------------------------------------------------------------------
// Customer side wiring
// ---------------------------------------------------------------------------
const customerButtonsEl = document.getElementById("customerIntentButtons");
const customerMessageEl = document.getElementById("customerMessageText");

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utterance);
}

function selectCustomerIntent(key, buttonEl) {
  const intent = customerIntents[key];
  if (!intent) return;

  customerMessageEl.textContent = intent.phrase;

  document
    .querySelectorAll("#customerIntentButtons .intent-btn")
    .forEach((btn) => btn.classList.remove("is-active"));
  buttonEl.classList.add("is-active");

  speak(intent.phrase);
}

Object.entries(customerIntents).forEach(([key, intent]) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "intent-btn customer-btn";
  btn.textContent = intent.label;
  btn.addEventListener("click", () => selectCustomerIntent(key, btn));
  customerButtonsEl.appendChild(btn);
});

// ---------------------------------------------------------------------------
// Type a Message (secondary customer input)
// Reuses the existing speak() function for "Speak Message".
// ---------------------------------------------------------------------------
const typeMessageInputEl = document.getElementById("typeMessageInput");
const sendMessageBtnEl = document.getElementById("sendMessageBtn");
const speakMessageBtnEl = document.getElementById("speakMessageBtn");
const typeMessageNoticeEl = document.getElementById("typeMessageNotice");
const customerMessageDisplayEl = document.getElementById("customerMessageDisplayText");

function showTypeMessageNotice(text) {
  typeMessageNoticeEl.textContent = text;
  typeMessageNoticeEl.hidden = false;
}

function clearTypeMessageNotice() {
  typeMessageNoticeEl.hidden = true;
  typeMessageNoticeEl.textContent = "";
}

sendMessageBtnEl.addEventListener("click", () => {
  const message = typeMessageInputEl.value;
  if (!message.trim()) {
    showTypeMessageNotice("Please enter a message first.");
    return;
  }
  clearTypeMessageNotice();
  customerMessageDisplayEl.textContent = message;
});

speakMessageBtnEl.addEventListener("click", () => {
  const message = typeMessageInputEl.value;
  if (!message.trim()) {
    showTypeMessageNotice("Please enter a message first.");
    return;
  }
  clearTypeMessageNotice();
  speak(message);
});

// ---------------------------------------------------------------------------
// Order Total
// Cashier enters an amount and sends it to the customer-facing display.
// ---------------------------------------------------------------------------
const orderTotalInputEl = document.getElementById("orderTotalInput");
const sendTotalBtnEl = document.getElementById("sendTotalBtn");
const clearTotalBtnEl = document.getElementById("clearTotalBtn");
const orderTotalTextEl = document.getElementById("orderTotalText");

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amount);
}

sendTotalBtnEl.addEventListener("click", () => {
  const amount = parseFloat(orderTotalInputEl.value);
  if (Number.isNaN(amount) || amount < 0) return;
  orderTotalTextEl.textContent = formatCurrency(amount);
});

clearTotalBtnEl.addEventListener("click", () => {
  orderTotalInputEl.value = "";
  orderTotalTextEl.textContent = formatCurrency(0);
});

// ---------------------------------------------------------------------------
// Cashier side wiring
// ---------------------------------------------------------------------------
const cashierButtonsEl = document.getElementById("cashierResponseButtons");
const cashierPhraseEl = document.getElementById("cashierResponsePhrase");
const aslVideoEl = document.getElementById("aslVideo");
const aslVideoErrorEl = document.getElementById("aslVideoError");

let currentResponseKey = null;

function showAslVideoError() {
  aslVideoEl.hidden = true;
  aslVideoErrorEl.textContent = "ASL response video could not be loaded.";
  aslVideoErrorEl.hidden = false;
}

function playAslResponse(key, buttonEl) {
  const response = aslResponses[key];
  if (!response) return;

  cashierPhraseEl.textContent = response.phrase;

  document
    .querySelectorAll("#cashierResponseButtons .intent-btn")
    .forEach((btn) => btn.classList.remove("is-active"));
  buttonEl.classList.add("is-active");

  aslVideoErrorEl.hidden = true;
  aslVideoEl.hidden = false;

  if (currentResponseKey === key) {
    // Same response selected again: restart from the beginning.
    aslVideoEl.currentTime = 0;
    aslVideoEl.play().catch(() => {});
  } else {
    // A different response was selected: switch videos and play.
    currentResponseKey = key;
    aslVideoEl.src = response.video;
    aslVideoEl.load();
    aslVideoEl.play().catch(() => {});
  }
}

aslVideoEl.addEventListener("error", showAslVideoError);

const cashierButtonEls = {};

Object.entries(aslResponses).forEach(([key, response]) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "intent-btn cashier-btn";
  btn.textContent = response.phrase;
  btn.addEventListener("click", () => playAslResponse(key, btn));
  cashierButtonsEl.appendChild(btn);
  cashierButtonEls[key] = btn;
});

// ---------------------------------------------------------------------------
// Cashier speech recognition (Phase 2)
// Phrase aliases: add more spoken variations per response key as needed.
// ---------------------------------------------------------------------------
const phraseAliases = {
  "do-you-need-help": [
    "do you need help",
    "do you need any help",
    "need help",
    "would you like help",
    "can i help you"
  ],
  "anything-else": [
    "anything else",
    "would you like anything else",
    "anything else today",
    "is there anything else"
  ],
  "thank-you": [
    "thank you",
    "thanks",
    "thank you so much",
    "thanks so much"
  ],
  "have-a-good-day": [
    "have a good day",
    "have a great day",
    "have a nice day"
  ]
};

const micButtonEl = document.getElementById("micButton");
const speechStatusEl = document.getElementById("speechStatusText");
const speechTranscriptEl = document.getElementById("speechTranscriptText");

function setSpeechStatus(text) {
  speechStatusEl.textContent = text;
}

function normalizeSpeech(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchResponseKey(normalizedText) {
  if (!normalizedText) return null;
  for (const [key, aliases] of Object.entries(phraseAliases)) {
    if (aliases.some((alias) => normalizedText.includes(alias))) {
      return key;
    }
  }
  return null;
}

const SpeechRecognitionCtor =
  window.SpeechRecognition || window.webkitSpeechRecognition;
const recognitionSupported = !!SpeechRecognitionCtor;

if (recognitionSupported) {
  const recognition = new SpeechRecognitionCtor();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let isListening = false;

  recognition.addEventListener("start", () => {
    isListening = true;
    micButtonEl.classList.add("is-listening");
    speechTranscriptEl.textContent = "—";
    setSpeechStatus("Listening...");
  });

  recognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript;
    speechTranscriptEl.textContent = transcript;
    setSpeechStatus("Matching response...");

    const matchedKey = matchResponseKey(normalizeSpeech(transcript));
    if (matchedKey) {
      setSpeechStatus("ASL response found");
      playAslResponse(matchedKey, cashierButtonEls[matchedKey]);
    } else {
      setSpeechStatus("No supported response matched");
    }
  });

  recognition.addEventListener("error", (event) => {
    if (
      event.error === "not-allowed" ||
      event.error === "service-not-allowed"
    ) {
      setSpeechStatus(
        "Microphone permission is required for spoken cashier responses. You can still use the response buttons."
      );
    } else {
      setSpeechStatus(
        "Sorry, I didn't catch that. Please try again or select a response manually."
      );
    }
  });

  recognition.addEventListener("end", () => {
    isListening = false;
    micButtonEl.classList.remove("is-listening");
  });

  micButtonEl.addEventListener("click", () => {
    if (isListening) return;
    try {
      recognition.start();
    } catch (err) {
      // start() throws if a recognition session is already active; ignore.
    }
  });
} else {
  micButtonEl.disabled = true;
  setSpeechStatus(
    "Speech recognition is not supported in this browser. Please use the response buttons."
  );
}
