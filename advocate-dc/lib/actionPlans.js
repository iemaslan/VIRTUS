/**
 * What the tenant physically does next, per strategy path.
 *
 * Deterministic on purpose: filing venues, phone numbers, and form names are
 * facts about the District's bureaucracy, and a model that improvises them
 * sends someone to the wrong office. The model chooses the path; this table
 * decides what that path means.
 */

export const ACTION_PLANS = {
  demand_letter: {
    label: "Written demand to the housing provider",
    venue: "Direct to your housing provider",
    steps: [
      "Fill in every square-bracket placeholder in the letter, then read it once out loud to catch anything that is not true.",
      "Send it two ways: email for speed, and USPS Certified Mail with Return Receipt for proof. The green receipt card is the evidence.",
      "Save the certified mail tracking number and a PDF of the sent email in the same folder as your lease.",
      "Put the response deadline in your calendar the day you send the letter.",
      "If the deadline passes with no reply, do not send a second letter — escalate.",
    ],
  },
  ota_complaint: {
    label: "Complaint to the Office of the Tenant Advocate",
    venue: "D.C. Office of the Tenant Advocate — (202) 719-6560, ota.dc.gov",
    steps: [
      "Call OTA at (202) 719-6560 or start an intake at ota.dc.gov. Intake is free and does not require a lawyer.",
      "Attach this letter to your complaint as your written statement of the dispute.",
      "Bring your lease, every dated message with your housing provider, and photographs with visible timestamps.",
      "Ask the intake officer directly which agency has jurisdiction — OTA will redirect you if the correct venue is elsewhere.",
      "Keep the complaint or intake number and reference it in all later correspondence.",
    ],
  },
  tenant_petition: {
    label: "Tenant petition to the Rental Accommodations Division",
    venue: "Rental Accommodations Division, DC Department of Housing and Community Development",
    steps: [
      "File a Tenant Petition with the Rental Accommodations Division; OTA will help you complete the form at no cost.",
      "Request your building's registration and exemption filings from RAD — an unregistered unit undermines the increase entirely.",
      "Attach this letter, the rent-increase notice you received, and rent receipts covering the last three years.",
      "Continue paying your existing lawful rent while the petition is pending, and keep proof of every payment.",
      "Watch for the hearing notice and confirm your mailing address with RAD in writing.",
    ],
  },
  small_claims: {
    label: "Claim in the Small Claims Branch of D.C. Superior Court",
    venue: "D.C. Superior Court, Small Claims and Conciliation Branch — 510 4th Street NW",
    steps: [
      "File a Statement of Claim at the Small Claims Branch. The limit is $10,000 and you do not need a lawyer.",
      "Attach this letter and its certified-mail receipt — proof that you demanded payment first matters to the judge.",
      "Prepare a single-page dated timeline, and bring three copies of every document: yours, the court's, and the other side's.",
      "Ask the clerk about the filing fee and whether you qualify for a fee waiver.",
      "Attend your hearing date. Most small claims cases are decided on documents, not argument.",
    ],
  },
  emergency_help: {
    label: "Urgent — get help today",
    venue: "OTA (202) 719-6560 · 311 for a housing inspection · 911 for an illegal lockout in progress",
    steps: [
      "If you have been locked out or your utilities were shut off, call the police now and report an illegal eviction — self-help eviction is unlawful in the District.",
      "Call the Office of the Tenant Advocate at (202) 719-6560 the same day and say the word 'emergency' during intake.",
      "Request an emergency housing inspection through 311 and write down the service-request number.",
      "Photograph and video everything, including timestamps, before anything is repaired or moved.",
      "Send this letter as your written record of what happened, but do not wait on a reply before calling for help.",
    ],
  },
};

export function getActionPlan(path) {
  return ACTION_PLANS[path] || ACTION_PLANS.demand_letter;
}
