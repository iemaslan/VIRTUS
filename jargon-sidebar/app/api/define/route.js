/**
 * Definition lookup for terms that detection already found.
 *
 * Glossary hits never reach this route — the client renders those instantly
 * from code. Only the terms nothing anticipated arrive here.
 */

import { createClient, defineTerms, MODEL } from "../../../lib/agents.js";
import { acceptDefinitions } from "../../../lib/detect.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_TERMS = 8;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_TERMS) : [];
  const clean = items
    .filter((i) => i && typeof i.term === "string" && i.term.trim())
    .map((i) => ({ term: i.term.trim().slice(0, 60), sentence: String(i.sentence || "").slice(0, 400) }));

  if (clean.length === 0) {
    return Response.json({ error: "No terms were sent." }, { status: 400 });
  }

  const client = createClient();
  if (!client) {
    return Response.json({
      demoMode: true,
      model: null,
      definitions: [],
      note: "No API key is configured, so terms outside the bundled glossary are listed as caught but not defined.",
    });
  }

  try {
    const result = await defineTerms(client, clean);
    const { accepted, rejected } = acceptDefinitions(
      result.definitions,
      clean.map((i) => i.term)
    );

    return Response.json({
      demoMode: false,
      model: MODEL,
      definitions: accepted,
      rejected: rejected.length ? rejected : undefined,
    });
  } catch (error) {
    console.error("[jargon-sidebar] definition call failed:", error);
    return Response.json(
      {
        error:
          error?.status === 401
            ? "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY."
            : error?.message || "The definition call failed.",
      },
      { status: 500 }
    );
  }
}
