/**
 * The pipeline, streamed.
 *
 * Each agent reports as it starts and finishes, and the drafting agent streams
 * its text, so the client can show the pipeline running rather than a spinner.
 * The wire format is newline-delimited JSON — one event per line.
 */

import {
  createClient,
  classifyIssue,
  chooseStrategy,
  draftLetter,
  MODEL,
} from "../../../lib/agents.js";
import { retrieveProvisions } from "../../../lib/corpus.js";
import { computeDeadlines } from "../../../lib/deadlines.js";
import { verifyDraft } from "../../../lib/verify.js";
import { getActionPlan } from "../../../lib/actionPlans.js";
import { AGENTS } from "../../../lib/pipeline.js";
import {
  DEMO_CLASSIFICATION,
  DEMO_STRATEGY,
  DEMO_LETTER,
  FABRICATED_SENTENCE,
} from "../../../lib/demo.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel's Hobby plan caps serverless functions at 60s; Pro allows more.
export const maxDuration = 60;

const MIN_DESCRIPTION = 20;
const MAX_DESCRIPTION = 4000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  const description = String(body.description || "").trim();
  const tenant = body.tenant || {};
  const injectFabricatedCitation = body.injectFabricatedCitation === true;

  if (description.length < MIN_DESCRIPTION) {
    return Response.json(
      { error: "Please describe what happened in a sentence or two — at least 20 characters." },
      { status: 400 }
    );
  }
  if (description.length > MAX_DESCRIPTION) {
    return Response.json(
      { error: `Please keep the description under ${MAX_DESCRIPTION} characters.` },
      { status: 400 }
    );
  }

  const client = await createClient();
  const demoMode = client === null;
  const today = new Date().toISOString().slice(0, 10);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      const started = (id) => send({ type: "agent", id, status: "running" });
      const finished = (id, data) => send({ type: "agent", id, status: "done", data });

      try {
        send({ type: "start", demoMode, model: demoMode ? null : MODEL, agents: AGENTS });

        // --- Agent 1: classification (model) -----------------------------
        started(1);
        const classification = demoMode
          ? (await sleep(700), DEMO_CLASSIFICATION)
          : await classifyIssue(client, description, today);
        finished(1, { classification });

        // --- Agent 2: legal grounding (deterministic) --------------------
        started(2);
        const provisions = retrieveProvisions({
          category: classification.category,
          text: `${description} ${(classification.key_facts || []).join(" ")}`,
        });
        if (demoMode) await sleep(350);
        const deadlines = computeDeadlines(provisions, {
          triggerDate: classification.trigger_date,
          triggerKind: classification.trigger_kind,
        });
        finished(2, { provisions, deadlines });

        // --- Agent 3: strategy (model) -----------------------------------
        started(3);
        const strategy = demoMode
          ? (await sleep(600), DEMO_STRATEGY)
          : await chooseStrategy(client, { classification, provisions, deadlines });
        const actionPlan = getActionPlan(strategy.path);
        finished(3, { strategy, actionPlan });

        // --- Agent 4: drafting (model, streamed) -------------------------
        started(4);
        let letter = "";
        if (demoMode) {
          for (const chunk of DEMO_LETTER.match(/\S+\s*/g) || []) {
            letter += chunk;
            send({ type: "letter_delta", text: chunk });
            await sleep(12);
          }
        } else {
          for await (const chunk of draftLetter(client, {
            classification,
            strategy,
            provisions,
            deadlines,
            tenant,
            today,
          })) {
            letter += chunk;
            send({ type: "letter_delta", text: chunk });
          }
        }

        // Demo control: deliberately plant a hallucinated citation so the
        // verifier below can be seen catching it. Always disclosed to the UI.
        if (injectFabricatedCitation) {
          letter += FABRICATED_SENTENCE;
          send({ type: "letter_delta", text: FABRICATED_SENTENCE });
        }
        finished(4, { letter, sabotaged: injectFabricatedCitation });

        // --- Agent 5: verification (deterministic) -----------------------
        started(5);
        if (demoMode) await sleep(350);
        const verification = verifyDraft(letter, provisions);
        finished(5, { verification });

        send({
          type: "complete",
          result: {
            demoMode,
            model: demoMode ? null : MODEL,
            classification,
            provisions,
            deadlines,
            strategy,
            actionPlan,
            letter,
            verification,
            generatedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error("[advocate] pipeline failed:", error);
        send({
          type: "error",
          message:
            error?.status === 401
              ? "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY."
              : error?.message || "The pipeline failed unexpectedly.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
