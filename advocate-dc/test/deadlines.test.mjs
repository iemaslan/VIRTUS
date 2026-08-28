import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { computeDeadlines, parseDate } from "../lib/deadlines.js";
import { selectProvisions } from "../lib/retrieval.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = JSON.parse(
  readFileSync(path.join(here, "..", "data", "dcTenantLaw.json"), "utf8")
);

const deposit = selectProvisions(CORPUS, {
  category: "security_deposit",
  text: "deposit never returned after move-out",
});

test("parseDate rejects anything that is not an ISO date", () => {
  assert.equal(parseDate("last summer"), null);
  assert.equal(parseDate(null), null);
  assert.equal(parseDate("2026-06-30").toISOString().slice(0, 10), "2026-06-30");
});

test("an expired 45-day deposit clock is reported as expired, with the day count", () => {
  const clocks = computeDeadlines(deposit, {
    triggerDate: "2026-06-30",
    triggerKind: "tenancy_end",
    today: new Date(Date.UTC(2026, 7, 28)), // 2026-08-28
  });

  const fortyFive = clocks.find((c) => c.provisionId === "DC-DEPOSIT-RETURN");
  assert.equal(fortyFive.dueDate, "2026-08-14");
  assert.equal(fortyFive.status, "expired");
  assert.equal(fortyFive.daysRemaining, -14);
  assert.match(fortyFive.note, /passed 14 days ago/);
});

test("a clock that has not run yet is open", () => {
  const clocks = computeDeadlines(deposit, {
    triggerDate: "2026-08-20",
    triggerKind: "tenancy_end",
    today: new Date(Date.UTC(2026, 7, 28)),
  });

  const fortyFive = clocks.find((c) => c.provisionId === "DC-DEPOSIT-RETURN");
  assert.equal(fortyFive.status, "open");
  assert.equal(fortyFive.daysRemaining, 37);
});

test("no trigger date means no invented deadlines", () => {
  assert.deepEqual(
    computeDeadlines(deposit, { triggerDate: null, triggerKind: "tenancy_end" }),
    []
  );
});

test("clocks belonging to a different trigger are not applied", () => {
  const clocks = computeDeadlines(deposit, {
    triggerDate: "2026-06-30",
    triggerKind: "tenancy_end",
    today: new Date(Date.UTC(2026, 7, 28)),
  });

  assert.ok(
    !clocks.some((c) => c.provisionId === "DC-DEPOSIT-ITEMIZE"),
    "the 30-day itemization clock starts at the withholding notice, not move-out"
  );
});
