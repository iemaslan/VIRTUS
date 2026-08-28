# Live Jargon Sidebar

Point it at a talk. It transcribes as the speaker goes, catches the terms an
audience is likely to stumble on, and keeps a running sidebar of short
definitions — each tied to the sentence it was actually said in.

Built for DevFest DC 2026, concept 5.3 — Live Jargon Sidebar.

## The engineering decision

Four steps. **Two of them are code, and they are the two that decide anything.**

| # | Step | Implementation | Job |
|---|------|----------------|-----|
| 1 | Transcription | **Browser** — Web Speech API | Turn the room's audio into text, on device |
| 2 | Jargon detection | **Code** — `lib/detect.js` | Decide which words are jargon, and in which sentence |
| 3 | Definition | Claude, JSON-schema constrained | Say what an unfamiliar term means, in context |
| 4 | Acceptance | **Code** — `acceptDefinitions` | Discard any definition for a term nobody said |

**A sidebar that arrives late is a transcript.** Asking a model which words are
jargon would cost a call per sentence, return a different set each time the same
talk was replayed, and land after the speaker had moved on. So detection is a
pure function of the text, and the ~60 terms that turn up in almost every
technical talk are defined in a bundled glossary that renders instantly, with no
network call at all. The model is reserved for the terms nothing anticipated.

Two invariants are enforced and tested:

- **The longest reading wins.** `ci/cd` is one term, not `ci/cd` followed by
  `ci` again. A matched span is blanked out before the next term is tried.
- **Nothing is defined that was not said.** Every definition is matched back
  against the terms detection actually found; one for a term that never appeared
  is discarded before it reaches the screen.

A word that is also ordinary English — *agent*, *token*, *cache* — only counts
as jargon when the rest of the sentence is technical, and the term is removed
from its own sentence before that check, so it cannot vouch for itself.

## Running it

```bash
npm install
cp .env.example .env.local     # paste your key from console.anthropic.com
npm run dev
```

Without a key it still runs: glossary terms are defined from code, and anything
else is shown as caught but undefined, with the interface saying why.

```bash
npm test     # 11 tests, zero dependencies, no network, no API key
```

Speech recognition needs Chrome or Edge and an HTTPS origin. Everywhere else the
paste box takes a real transcript and the rest of the pipeline is identical.

## Demo

1. Press **Start listening** and talk about anything technical. Terms appear in
   the sidebar as you say them; glossary hits are instant.
2. Say an acronym the glossary has never met — that one goes to the model with
   the sentence around it, and comes back defined in context.
3. If the room's microphone is unusable, **Play scripted sample** runs a written
   talk through the same pipeline. It is labelled as scripted on screen.

## What this cannot do

It hears what the microphone hears. A mishearing becomes a wrong term, and the
tool cannot tell a mangled word from a real one it has never met. Detection is
computed in code and is reproducible for the same transcript; the definitions
are written by a model and are a starting point, not a reference.
