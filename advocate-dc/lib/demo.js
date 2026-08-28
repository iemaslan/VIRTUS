/**
 * Scripted demo mode.
 *
 * With no ANTHROPIC_API_KEY configured, the app still runs end to end using a
 * fixed intake, strategy, and letter. The two deterministic agents — retrieval
 * and verification — are the real implementations even here, so the citation
 * guard can be demonstrated on a laptop with no network and no key.
 */

export const DEMO_DESCRIPTION =
  "My lease ended on June 30, 2026 and I moved out that day. It is almost two months later and my landlord still has not returned my $1,800 security deposit. He never sent me any notice explaining a deduction, and he has stopped replying to my emails. I lived in the apartment for two years.";

export const DEMO_CLASSIFICATION = {
  category: "security_deposit",
  severity: "medium",
  summary:
    "The tenant moved out on June 30, 2026 and has received neither their $1,800 security deposit nor any written notice of a deduction.",
  key_facts: [
    "Lease ended and tenant moved out on June 30, 2026.",
    "Security deposit of $1,800 has not been returned.",
    "No written notice of any intent to withhold was received.",
    "The tenancy lasted approximately two years.",
    "The housing provider has stopped responding to emails.",
  ],
  trigger_date: "2026-06-30",
  trigger_kind: "tenancy_end",
  money_at_stake: 1800,
  evidence_mentioned: ["Email correspondence with the housing provider"],
  missing_information: [
    "The exact date of the last email you sent, and whether you have proof of delivery.",
    "Your forwarding address as given to the housing provider in writing.",
    "Whether the lease states which bank held the deposit.",
  ],
};

export const DEMO_STRATEGY = {
  path: "demand_letter",
  reasoning:
    "The 45-day statutory deadline has already passed without any notice, which is the strongest possible position to write from. A dated written demand costs you nothing, and it is the document a judge will look for first if this ends up in Small Claims Court.",
  what_to_ask_for:
    "Full return of the $1,800 deposit plus accrued interest, within 14 days.",
  response_window_days: 14,
  escalation:
    "If the deadline passes without payment, file in the Small Claims Branch of D.C. Superior Court and ask for treble damages.",
};

export const DEMO_LETTER = `[DATE]

[HOUSING PROVIDER NAME]
[HOUSING PROVIDER ADDRESS]

Re: Return of security deposit — [PROPERTY ADDRESS]

Dear [HOUSING PROVIDER NAME],

My tenancy at [PROPERTY ADDRESS] ended on June 30, 2026, and I vacated the unit that day. As of the date of this letter, I have not received my security deposit of $1,800, and I have received no written notice of any intent to withhold any portion of it.

Under D.C. Code § 42-3502.17, a housing provider has 45 days after the end of a tenancy either to return the security deposit in full or to provide the tenant with written notice of an intent to withhold [DC-DEPOSIT-RETURN]. That deadline expired on August 14, 2026. No notice was sent, and no funds were returned.

Because no withholding notice was issued, no deduction is available to you, and the itemized statement that would otherwise be required under D.C. Code § 42-3502.17 was never provided [DC-DEPOSIT-ITEMIZE]. My tenancy also lasted more than twelve months, so the deposit was required to be held in an interest-bearing escrow account and the accrued interest is owed to me along with the principal, under 14 DCMR § 311 [DC-DEPOSIT-INTEREST].

I am requesting the full return of $1,800 plus accrued interest within 14 days of the date of this letter. Payment may be sent to [TENANT ADDRESS].

If I do not receive payment within that period, I will file a claim in the Small Claims Branch of the Superior Court of the District of Columbia and will seek up to three times the amount withheld, as D.C. Code § 42-3502.17 permits where a deposit is retained in bad faith [DC-DEPOSIT-BADFAITH].

I would prefer to resolve this directly and without a filing. Please treat this letter as a formal written demand.

Sincerely,

[TENANT NAME]
[PROPERTY ADDRESS]
[TENANT EMAIL] · [TENANT PHONE]`;

/**
 * The sabotage used by the "show me the guard working" control in the UI.
 * A sentence with a statute that does not exist, written the way a model
 * hallucinating a citation would write it — confident and correctly formatted.
 */
export const FABRICATED_SENTENCE =
  "\n\nFurthermore, under D.C. Code § 42-3502.44, you are required to pay an additional statutory penalty of $500 per week for every week the deposit remains outstanding [DC-DEPOSIT-WEEKLY-PENALTY].";
