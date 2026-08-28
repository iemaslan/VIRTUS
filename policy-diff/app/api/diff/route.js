/**
 * The pipeline.
 *
 * Four of the five steps are code. The model runs once, in step 4, on a list of
 * changes it did not choose and cannot add to.
 */

import { segment } from "../../../lib/segment.js";
import { alignDocuments } from "../../../lib/diff.js";
import { rankChanges, severityBand } from "../../../lib/impact.js";
import { verifyExplanations } from "../../../lib/verify.js";
import { createClient, explainChanges, MODEL } from "../../../lib/agents.js";
import { composeExplanations } from "../../../lib/fallback.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CHARS = 60000;
const MAX_EXPLAINED = 12;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  const before = String(body.before || "").trim();
  const after = String(body.after || "").trim();

  if (!before || !after) {
    return Response.json({ error: "Paste both versions of the document." }, { status: 400 });
  }
  if (before.length > MAX_CHARS || after.length > MAX_CHARS) {
    return Response.json(
      { error: `Each version must be under ${MAX_CHARS.toLocaleString()} characters.` },
      { status: 400 }
    );
  }

  try {
    // Steps 1-3, all deterministic.
    const beforeSegments = segment(before);
    const afterSegments = segment(after);
    const { changes, summary } = alignDocuments(beforeSegments, afterSegments);
    const ranked = rankChanges(changes).map((c) => ({ ...c, severity: severityBand(c.impact.score) }));

    if (ranked.length === 0) {
      return Response.json({
        demoMode: false,
        summary,
        ranked: [],
        documentSummary: "These two versions are identical in substance. Nothing changed that affects a reader.",
        verification: { passed: true, results: [], summary: { checked: 0, verified: 0, problems: 0 } },
      });
    }

    const toExplain = ranked.slice(0, MAX_EXPLAINED);

    // Step 4 — the model.
    //
    // If the model call fails we still return a result, composed in code, because
    // a half-broken diff is worse than a plain one. But the failure is reported
    // rather than hidden: a tool that claims every quote is checked cannot also
    // quietly present its own template text as the model's words.
    const client = createClient();
    const demoMode = client === null;

    let explained;
    let modelError = null;
    if (demoMode) {
      explained = composeExplanations(toExplain, "no API key is configured");
    } else {
      try {
        explained = await explainChanges(client, toExplain);
      } catch (error) {
        modelError = error?.message || "The model call failed.";
        console.error("[policy-diff] model call failed, falling back to code:", error);
        explained = composeExplanations(toExplain, "the model call failed");
      }
    }

    // Step 5 — verification, deterministic.
    const verification = verifyExplanations(explained.explanations, toExplain);

    const byId = new Map(explained.explanations.map((e) => [e.change_id, e]));
    const verificationById = new Map(verification.results.map((r) => [r.changeId, r]));

    return Response.json({
      demoMode,
      modelError,
      model: demoMode || modelError ? null : MODEL,
      summary,
      documentSummary: explained.document_summary,
      truncated: ranked.length > MAX_EXPLAINED ? ranked.length - MAX_EXPLAINED : 0,
      ranked: toExplain.map((change) => ({
        ...change,
        explanation: byId.get(change.id) || null,
        quoteCheck: verificationById.get(change.id) || null,
      })),
      verification,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[policy-diff] failed:", error);
    return Response.json(
      {
        error:
          error?.status === 401
            ? "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY."
            : error?.message || "The diff failed unexpectedly.",
      },
      { status: 500 }
    );
  }
}
