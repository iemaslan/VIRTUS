/**
 * Deterministic deadline math.
 *
 * Statutory clocks are arithmetic, and arithmetic is not something to delegate
 * to a language model. Agent 1 extracts the date the clock started; this module
 * computes what that date means. Every number the user sees on a deadline comes
 * from here, not from a model.
 *
 * Pure functions only — no imports, so this module is testable in plain Node.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The events that can start a statutory clock, matching `deadline_from` in the corpus. */
export const TRIGGER_KINDS = [
  "tenancy_end",
  "withholding_notice",
  "protected_activity",
  "last_increase",
  "increase_notice",
  "claim_arose",
  "none",
];

export const TRIGGER_LABELS = {
  tenancy_end: "the day the tenancy ended",
  withholding_notice: "the withholding notice",
  protected_activity: "the complaint or repair request",
  last_increase: "the previous rent increase",
  increase_notice: "the rent-increase notice",
  claim_arose: "the day the problem started",
  none: "an unknown date",
};

/** Parse "2026-06-30" into a UTC date, or null if it is not a usable date. */
export function parseDate(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function daysBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Turn a trigger date into concrete deadlines for the provisions that carry one.
 *
 * @param {Array}  provisions   provisions retrieved by Agent 2
 * @param {object} options
 * @param {string} options.triggerDate  ISO date the clock started (may be null)
 * @param {string} options.triggerKind  which event that date represents
 * @param {Date}   options.today        injected for testability
 * @returns {Array} one entry per applicable statutory clock
 */
export function computeDeadlines(provisions, { triggerDate, triggerKind, today = new Date() } = {}) {
  const start = parseDate(triggerDate);
  if (!start) return [];

  const now = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );

  return provisions
    .filter(
      (provision) =>
        typeof provision.deadline_days === "number" &&
        (provision.deadline_from === triggerKind ||
          provision.deadline_from === "claim_arose")
    )
    .map((provision) => {
      const due = addDays(start, provision.deadline_days);
      const daysRemaining = daysBetween(now, due);

      return {
        provisionId: provision.id,
        title: provision.title,
        authority: provision.authority,
        days: provision.deadline_days,
        countsFrom: TRIGGER_LABELS[provision.deadline_from] || provision.deadline_from,
        startDate: toISODate(start),
        dueDate: toISODate(due),
        daysRemaining,
        status: daysRemaining < 0 ? "expired" : daysRemaining <= 14 ? "due_soon" : "open",
        note:
          daysRemaining < 0
            ? `This deadline passed ${Math.abs(daysRemaining)} day${
                Math.abs(daysRemaining) === 1 ? "" : "s"
              } ago.`
            : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left.`,
      };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}
