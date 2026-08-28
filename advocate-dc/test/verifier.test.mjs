/**
 * The hallucination guard is the claim this project is built on, so it is the
 * thing that gets tested. These tests run with zero dependencies:
 *
 *   npm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { verifyDraft, extractCitations, extractTags } from "../lib/verify.js";
import { selectProvisions, normalizeSection } from "../lib/retrieval.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = JSON.parse(
  readFileSync(path.join(here, "..", "data", "dcTenantLaw.json"), "utf8")
);

const depositProvisions = selectProvisions(CORPUS, {
  category: "security_deposit",
  text: "my landlord never returned my security deposit after I moved out",
});

test("retrieval returns deposit provisions and always includes OTA", () => {
  const ids = depositProvisions.map((p) => p.id);
  assert.ok(ids.includes("DC-DEPOSIT-RETURN"), "expected the 45-day rule");
  assert.ok(ids.includes("DC-OTA-CONTACT"), "OTA contact is pinned to every case");
  assert.ok(
    !ids.includes("DC-EVICT-SELFHELP"),
    "an unrelated eviction provision should not be retrieved"
  );
});

test("a draft citing only retrieved law passes verification", () => {
  const draft = `Dear Housing Provider,

My tenancy ended on June 30, 2026. Under D.C. Code § 42-3502.17, you had 45 days
to return my security deposit or send written notice of an intent to withhold it
[DC-DEPOSIT-RETURN]. Neither arrived.

Sincerely,
[TENANT NAME]`;

  const result = verifyDraft(draft, depositProvisions);
  assert.equal(result.passed, true);
  assert.equal(result.summary.problemCount, 0);
  assert.equal(result.summary.citationsVerified, 1);
  assert.equal(result.summary.tagsVerified, 1);
});

test("a fabricated statute is caught", () => {
  const draft = `Under D.C. Code § 42-9999.99, you owe me the deposit immediately.`;

  const result = verifyDraft(draft, depositProvisions);
  assert.equal(result.passed, false);

  const fabricated = result.citations.find((c) => c.section === "42-9999.99");
  assert.equal(fabricated.status, "unverified");
  assert.match(fabricated.context, /42-9999\.99/);
});

test("a real statute that was not retrieved for this case is caught", () => {
  // § 42-3505.02 is genuine DC law, but it is a retaliation provision and was
  // not retrieved for a deposit case — the draft still may not lean on it.
  const draft = `You have retaliated against me in violation of D.C. Code § 42-3505.02.`;

  const result = verifyDraft(draft, depositProvisions);
  assert.equal(result.passed, false);
  assert.equal(result.citations[0].status, "unverified");
});

test("a fabricated provision tag is caught", () => {
  const draft = `The law requires immediate payment [DC-DEPOSIT-INSTANT-REFUND].`;

  const result = verifyDraft(draft, depositProvisions);
  assert.equal(result.passed, false);
  assert.equal(result.tags[0].id, "DC-DEPOSIT-INSTANT-REFUND");
  assert.equal(result.tags[0].status, "unverified");
});

test("citing a real section under the wrong authority is caught", () => {
  // 301 is a DCMR housing-code section, not a D.C. Code section.
  const habitability = selectProvisions(CORPUS, {
    category: "repair_habitability",
    text: "there is mold and the heat is broken",
  });

  const draft = `The unit is uninhabitable under D.C. Code § 301.`;
  const result = verifyDraft(draft, habitability);

  assert.equal(result.passed, false);
  assert.equal(result.citations[0].status, "wrong_authority");
  assert.match(result.citations[0].message, /DCMR/);
});

test("the correct authority for the same section passes", () => {
  const habitability = selectProvisions(CORPUS, {
    category: "repair_habitability",
    text: "there is mold and the heat is broken",
  });

  const result = verifyDraft(`The unit violates 14 DCMR § 301.`, habitability);
  assert.equal(result.passed, true);
});

test("citation extraction handles punctuation and unicode dashes", () => {
  assert.equal(normalizeSection("§ 42-3502.17."), "42-3502.17");
  assert.equal(normalizeSection("42‐13502.17"), "42-13502.17");

  const found = extractCitations("See D.C. Code § 42-3502.17, and also 14 DCMR § 311.");
  assert.equal(found.length, 2);
  assert.deepEqual(
    found.map((c) => c.family),
    ["dccode", "dcmr"]
  );
});

test("statutes cited without a section symbol are still checked", () => {
  const result = verifyDraft("As stated in D.C. Code 42-1111.11 you must pay.", depositProvisions);
  assert.equal(result.passed, false);
  assert.equal(result.citations[0].status, "unverified");
});

test("a non-DC statute is treated as unverified", () => {
  const result = verifyDraft("This violates 42 U.S.C. § 1983.", depositProvisions);
  assert.equal(result.passed, false);
  assert.equal(result.citations.at(-1).status, "unverified");
});

test("tag extraction ignores ordinary bracketed placeholders", () => {
  const tags = extractTags("Sincerely, [TENANT NAME] on [DATE] re [DC-DEPOSIT-RETURN]");
  assert.deepEqual(
    tags.map((t) => t.id),
    ["DC-DEPOSIT-RETURN"]
  );
});

test("an empty draft verifies vacuously rather than throwing", () => {
  const result = verifyDraft("", depositProvisions);
  assert.equal(result.passed, true);
  assert.equal(result.summary.citationsChecked, 0);
});
