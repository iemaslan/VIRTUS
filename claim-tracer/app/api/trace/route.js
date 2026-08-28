/**
 * The pipeline, streamed as newline-delimited JSON.
 *
 * Claims are extracted by the model, triaged in code, searched by the model's
 * server-side search tool, and graded in code. The verdict on every claim is
 * computed here from the URLs the search engine returned — never from what the
 * model said about them.
 */

import { createClient, extractClaims, searchClaim, MODEL } from "../../../lib/agents.js";
import { triageClaim, buildQuery } from "../../../lib/triage.js";
import { verdictFor, classifySource } from "../../../lib/sources.js";
import { DEMO_CLAIMS, DEMO_RESULTS, DEMO_LABEL } from "../../../lib/fallback.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CHARS = 8000;
const MAX_SEARCHED = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  const text = String(body.text || "").trim();
  if (text.length < 30) {
    return Response.json({ error: "Paste a post with at least a couple of sentences in it." }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return Response.json({ error: `Keep it under ${MAX_CHARS.toLocaleString()} characters.` }, { status: 400 });
  }

  const client = createClient();
  const demoMode = client === null;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      try {
        send({ type: "start", demoMode, model: demoMode ? null : MODEL, note: demoMode ? DEMO_LABEL : null });

        // --- Step 1: extract claims (model) ------------------------------
        send({ type: "stage", id: 1, status: "running" });
        const rawClaims = demoMode ? (await sleep(700), DEMO_CLAIMS) : await extractClaims(client, text);
        send({ type: "stage", id: 1, status: "done", count: rawClaims.length });

        // --- Step 2: triage (code) ---------------------------------------
        send({ type: "stage", id: 2, status: "running" });
        const claims = rawClaims.map((claim, index) => {
          const triage = triageClaim(claim.text);
          return {
            id: `K${index}`,
            index,
            text: claim.text,
            quote: claim.quote,
            triage,
            query: triage.searchable ? buildQuery(claim.text) : null,
          };
        });
        for (const claim of claims) {
          send({ type: "claim", claim });
          if (demoMode) await sleep(120);
        }
        send({ type: "stage", id: 2, status: "done", searchable: claims.filter((c) => c.triage.searchable).length });

        const searchable = claims.filter((c) => c.triage.searchable).slice(0, MAX_SEARCHED);
        const skippedForBudget = claims.filter((c) => c.triage.searchable).length - searchable.length;

        // --- Steps 3 & 4: search (model tool) and grade (code) -----------
        send({ type: "stage", id: 3, status: "running", searching: searchable.length });

        const traceOne = async (claim) => {
          let found = { results: [], summary: "" };
          if (demoMode) {
            await sleep(500);
            found = DEMO_RESULTS[claim.text] || { results: [], summary: "No fixture for this claim." };
          } else {
            found = await searchClaim(client, claim.text, claim.query).catch((error) => ({
              results: [],
              summary: `Search failed for this claim: ${error.message}`,
            }));
          }

          // The verdict is computed from the search engine's own URLs.
          const graded = found.results.map((r) => ({ ...classifySource(r.url), title: r.title }));
          const verdict = verdictFor(graded);

          return {
            claimId: claim.id,
            summary: found.summary,
            sources: verdict.graded.map((source, i) => ({ ...source, title: graded[i]?.title || source.host })),
            verdict: verdict.verdict,
            verdictLabel: verdict.label,
            verdictReason: verdict.reason,
          };
        };

        const traced = [];
        await Promise.all(
          searchable.map((claim) =>
            traceOne(claim).then((trace) => {
              traced.push(trace);
              send({ type: "trace", trace });
            })
          )
        );

        send({ type: "stage", id: 3, status: "done" });
        send({ type: "stage", id: 4, status: "done" });

        const counts = traced.reduce(
          (acc, t) => ({ ...acc, [t.verdict]: (acc[t.verdict] || 0) + 1 }),
          { sourced: 0, weak: 0, untraceable: 0 }
        );

        send({
          type: "complete",
          result: {
            demoMode,
            model: demoMode ? null : MODEL,
            claims,
            traces: traced,
            counts,
            notSearched: claims.filter((c) => !c.triage.searchable).length,
            skippedForBudget,
            generatedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error("[claim-tracer] failed:", error);
        send({
          type: "error",
          message:
            error?.status === 401
              ? "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY."
              : error?.message || "The trace failed unexpectedly.",
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
