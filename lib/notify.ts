import "server-only";

/**
 * Admin notifications (to the ASF admin inbox) sent via Resend. Two events:
 *   - a donation was recorded
 *   - a campaign reached its goal (fully funded)
 *
 * Best-effort: every send is wrapped so a mail failure never breaks payment
 * recording. Requires RESEND_API_KEY; falls back to the Resend onboarding
 * sender if CONTACT_FROM_EMAIL isn't set.
 */

// ASF admin inbox. Placeholder until go-live — see kitup-placeholder-support-email.
const ADMIN_RECIPIENT = "rosie.johnson@pep.com.au";

// Go-live routing (see kitup-email-recipients). All placeholders for now — set
// the real ASF and Modern Star (supplier) addresses before go-live.
//   - ASF:       donation-received, reconciliation
//   - Supplier:  order invoice, reconciliation
const ASF_RECIPIENT = ADMIN_RECIPIENT;
const SUPPLIER_RECIPIENT = ADMIN_RECIPIENT;

// Blind-copy a monitoring inbox on every outgoing email (donor-facing ones
// included), so there's a record of everything sent. BCC (not CC) so external
// recipients never see this internal address. Skipped when it's already a
// recipient, to avoid duplicates.
const MONITOR_COPY = "rosie.johnson@pep.com.au";

// Friendly user-facing sender (donor thank-yous, welcome emails). Requires the
// kitup.tech domain to be verified in Resend (SPF/DKIM) or sends will fail.
const KITUP_FROM_EMAIL = "Kit Up <hello@kitup.tech>";

// Public site URL, for links in user-facing emails.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kitup.tech";

// One-line "what is Kit Up" blurb for emails to people new to the platform.
const KITUP_BLURB_TEXT =
  "Kit Up is a crowdfunding platform where Australian schools list the sports gear they need and their community funds it, item by item. Donations are processed by the Australian Sports Foundation, so gifts of $2 or more are tax deductible.";
const KITUP_BLURB_HTML = `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:12px 0;background:#f7f7f5;border-radius:8px">
    <tr>
      <td style="padding:12px 0 12px 14px;vertical-align:top;width:54px"><img src="${APP_URL}/email/kitup-icon.png" width="40" height="40" alt="Kit Up" style="display:block;border-radius:9px"/></td>
      <td style="padding:12px 14px 12px 12px;vertical-align:middle;font-size:13px;line-height:1.5;color:#555">Kit Up is a crowdfunding platform where Australian schools list the sports gear they need and their community funds it, item by item. Donations are processed by the Australian Sports Foundation, so gifts of $2 or more are tax deductible.</td>
    </tr>
  </table>`;

function money(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(n);
}

async function sendEmail(
  to: string | string[],
  subject: string,
  text: string,
  html?: string,
  fromOverride?: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`notify: RESEND_API_KEY not set — skipped "${subject}"`);
    return false;
  }
  // De-dupe so (e.g.) ASF + supplier resolving to the same placeholder inbox
  // doesn't send two copies.
  const recipients = Array.from(new Set(Array.isArray(to) ? to : [to]));
  // Monitoring BCC — unless it's already a recipient (avoids a duplicate).
  const bcc = recipients.includes(MONITOR_COPY) ? [] : [MONITOR_COPY];
  const from =
    fromOverride ||
    process.env.CONTACT_FROM_EMAIL ||
    "Kit Up <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        ...(bcc.length ? { bcc } : {}),
        subject,
        text,
        ...(html ? { html } : {}),
      }),
    });
    if (!res.ok) {
      console.error("notify send failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("notify error", err);
    return false;
  }
}

async function sendAdminEmail(
  subject: string,
  text: string,
  html?: string,
): Promise<boolean> {
  return sendEmail(ADMIN_RECIPIENT, subject, text, html);
}

export interface InvoiceLine {
  sku: string | null;
  campaignTitle: string;
  itemTitle: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface SchoolInvoice {
  /** School name as registered (matched to ACARA at sign-up). */
  schoolName: string;
  /** ACARA-registered address (suburb, state, postcode), or null if unmatched. */
  acaraAddress: string | null;
  abn: string | null;
  abnEntityName: string | null;
  /** One-line ABN cross-check result vs the ACARA address. */
  abnCrossCheck: string;
  /** Whether the school has confirmed its delivery address in its profile. */
  deliveryConfirmed: boolean;
  donorLabel: string;
  sessionId: string;
  /** Invoice date, ISO string (formatted for display here). */
  dateISO: string;
  lines: InvoiceLine[];
  total: number;
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;",
  );
}

/** ACARA equity/demographic markers for a school (from school_registry). */
export interface SchoolDemographics {
  remoteness?: string | null;
  totalEnrolments?: number | null;
  icsea?: number | null;
  icseaPercentile?: number | null;
  seaBottomQuarter?: number | null;
  indigenousPct?: number | null;
  lbotePct?: number | null;
}

/** School-provided need/impact answers for a campaign. */
export interface CampaignImpact {
  studentsReached: number | null;
  barrier: string;
  studentsMissingOut: string;
  usageContext: string;
  usageFrequency: string;
  participationGoal: string;
}

const dash = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : String(v);
const pctVal = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${v}%`;

/** ACARA profile as label/value rows (empty array when no demographics). */
function demoRowsFor(d: SchoolDemographics | null): [string, string][] {
  return d
    ? [
        ["Remoteness", dash(d.remoteness)],
        ["Enrolments", dash(d.totalEnrolments)],
        [
          "ICSEA",
          d.icsea
            ? `${d.icsea}${d.icseaPercentile ? ` (percentile ${d.icseaPercentile})` : ""}`
            : "—",
        ],
        ["Most-disadvantaged quarter (low-SES)", pctVal(d.seaBottomQuarter)],
        ["First Nations students", pctVal(d.indigenousPct)],
        ["Language background other than English", pctVal(d.lbotePct)],
      ]
    : [];
}

/** Need/impact as label/value rows + whether any were actually filled in. */
function impactRowsFor(i: CampaignImpact | null): {
  rows: [string, string][];
  hasImpact: boolean;
} {
  const rows: [string, string][] = i
    ? [
        ["Students reached", dash(i.studentsReached)],
        ["Barrier to self-funding", dash(i.barrier)],
        ["Who's missing out", dash(i.studentsMissingOut)],
        ["Where/how used", dash(i.usageContext)],
        ["How often", dash(i.usageFrequency)],
        ["Participation goal", dash(i.participationGoal)],
      ]
    : [];
  return { rows, hasImpact: rows.some(([, v]) => v !== "—") };
}

const txtRows = (rows: [string, string][]) =>
  rows.map(([k, v]) => `  ${(k + ":").padEnd(38)} ${v}`).join("\n");

const htmlTable = (rows: [string, string][]) =>
  `<table style="border-collapse:collapse;font-size:14px;margin:4px 0 10px">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:3px 12px 3px 0;color:#888">${esc(k)}</td><td style="padding:3px 0;font-weight:${v === "—" ? "400" : "500"}">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;

/**
 * Admin invoice for a donation, addressed to the funded school. One email per
 * school (a cart spanning several schools produces one invoice each). Includes
 * the school's ACARA-registered delivery address (cross-checked against its
 * ABN) and the exact Hart SKU of every funded item — so ASF can place the
 * order and ship it. Sends both a plain-text and an HTML invoice.
 */
export async function notifyAdminInvoice(inv: SchoolInvoice): Promise<boolean> {
  const date = new Date(inv.dateISO).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const ref = inv.sessionId.slice(-10).toUpperCase();
  const subject = `[Kit Up] Order invoice — ${inv.schoolName} — ${money(inv.total)}`;
  const deliveryNote = inv.deliveryConfirmed
    ? "Delivery address confirmed by the school ✓"
    : "Delivery address auto-detected from ACARA location — confirm with the school before shipping.";

  // ---- plain text ----
  const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
  const clip = (s: string, n: number) =>
    s.length > n - 1 ? s.slice(0, n - 2) + "…" : s;
  const rows = inv.lines
    .map(
      (l) =>
        "  " +
        pad(l.sku ?? "—", 12) +
        pad(clip(l.itemTitle, 34), 34) +
        pad(String(l.quantity), 5) +
        pad(money(l.unitPrice), 11) +
        money(l.amount),
    )
    .join("\n");
  const text = `KIT UP — ORDER INVOICE
Invoice date: ${date}     Ref: KU-${ref}

DELIVER / BILL TO:
  ${inv.schoolName}
  ${inv.acaraAddress ?? "(address not matched in ACARA registry)"}
  ABN: ${inv.abn ?? "—"}${inv.abnEntityName ? `  (${inv.abnEntityName})` : ""}
  ${inv.abnCrossCheck}
  ${deliveryNote}

Funded by: ${inv.donorLabel}
Stripe session: ${inv.sessionId}

  ${pad("SKU", 12)}${pad("ITEM", 34)}${pad("QTY", 5)}${pad("UNIT", 11)}TOTAL
  ${"-".repeat(66)}
${rows}
  ${"-".repeat(66)}
  ${pad("", 51)}TOTAL FUNDED: ${money(inv.total)}

These items are now funded on Kit Up — please arrange the order and
deliver to the school address above.

— Kit Up / ASF admin`;

  // ---- HTML ----
  const htmlRows = inv.lines
    .map(
      (l) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace">${esc(l.sku ?? "—")}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(l.itemTitle)}<br><span style="color:#888;font-size:12px">${esc(l.campaignTitle)}</span></td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${l.quantity}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${money(l.unitPrice)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${money(l.amount)}</td>
      </tr>`,
    )
    .join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;color:#1a1a1a">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <h2 style="margin:0;color:#e5533c">Kit Up — Order Invoice</h2>
      <div style="text-align:right;font-size:13px;color:#555">${date}<br>Ref: KU-${ref}</div>
    </div>
    <div style="margin:16px 0;padding:12px 14px;background:#f7f7f5;border-radius:8px;font-size:14px;line-height:1.5">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#888">Deliver / bill to</div>
      <div style="font-weight:bold">${esc(inv.schoolName)}</div>
      <div>${esc(inv.acaraAddress ?? "(address not matched in ACARA registry)")}</div>
      <div>ABN: ${esc(inv.abn ?? "—")}${inv.abnEntityName ? ` <span style="color:#555">(${esc(inv.abnEntityName)})</span>` : ""}</div>
      <div style="font-size:13px;color:#555;margin-top:4px">${esc(inv.abnCrossCheck)}</div>
      <div style="font-size:13px;margin-top:4px;color:${inv.deliveryConfirmed ? "#2e7d32" : "#b26a00"}">${esc(deliveryNote)}</div>
    </div>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead><tr style="text-align:left;color:#555;font-size:12px;text-transform:uppercase">
        <th style="padding:6px 10px">SKU</th><th style="padding:6px 10px">Item</th>
        <th style="padding:6px 10px;text-align:center">Qty</th>
        <th style="padding:6px 10px;text-align:right">Unit</th>
        <th style="padding:6px 10px;text-align:right">Total</th>
      </tr></thead>
      <tbody>${htmlRows}</tbody>
      <tfoot><tr>
        <td colspan="4" style="padding:10px;text-align:right;font-weight:bold">Total funded</td>
        <td style="padding:10px;text-align:right;font-weight:bold">${money(inv.total)}</td>
      </tr></tfoot>
    </table>
    <p style="font-size:13px;color:#555">Funded by ${esc(inv.donorLabel)} · Stripe session <code>${esc(inv.sessionId)}</code></p>
    <p style="font-size:13px">These items are now funded on Kit Up — please arrange the order and deliver to the school address above.</p>
    <p style="font-size:12px;color:#999">— Kit Up / ASF admin</p>
  </div>`;

  // Order invoice → the supplier (Modern Star).
  return sendEmail(SUPPLIER_RECIPIENT, subject, text, html);
}

export interface CampaignLiveLine {
  sku: string | null;
  title: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface CampaignLiveNotice {
  campaignId: string;
  campaignTitle: string;
  schoolName: string;
  deadlineISO: string | null;
  lines: CampaignLiveLine[];
  total: number;
}

/**
 * Admin notice sent automatically when a school publishes a campaign ("go
 * live"), listing every item on the campaign with quantities and value.
 * Goes to the admin inbox (ADMIN_RECIPIENT).
 */
export async function notifyAdminCampaignLive(
  n: CampaignLiveNotice,
): Promise<boolean> {
  const subject = `[Kit Up] Campaign live — ${n.schoolName} — ${n.campaignTitle} (${money(n.total)})`;
  const deadline = n.deadlineISO
    ? new Date(n.deadlineISO).toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
  const url = `${APP_URL}/campaigns/${n.campaignId}`;

  // ---- plain text ----
  const pad = (s: string, w: number) => (s + " ".repeat(w)).slice(0, w);
  const clip = (s: string, w: number) =>
    s.length > w - 1 ? s.slice(0, w - 2) + "…" : s;
  const rows = n.lines
    .map(
      (l) =>
        "  " +
        pad(l.sku ?? "—", 12) +
        pad(clip(l.title, 36), 36) +
        pad(String(l.quantity), 5) +
        pad(money(l.unitPrice), 11) +
        money(l.lineTotal),
    )
    .join("\n");
  const text = `A campaign has just gone live on Kit Up.

School:   ${n.schoolName}
Campaign: ${n.campaignTitle}
Deadline: ${deadline}
Page:     ${url}

  ${pad("SKU", 12)}${pad("ITEM", 36)}${pad("QTY", 5)}${pad("UNIT", 11)}TOTAL
  ${"-".repeat(68)}
${rows}
  ${"-".repeat(68)}
  ${pad("", 53)}TOTAL VALUE: ${money(n.total)}

— Kit Up admin`;

  // ---- HTML ----
  const htmlRows = n.lines
    .map(
      (l) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace">${esc(l.sku ?? "—")}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(l.title)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${l.quantity}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${money(l.unitPrice)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${money(l.lineTotal)}</td>
      </tr>`,
    )
    .join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;color:#1a1a1a">
    <h2 style="margin:0 0 4px;color:#e5533c">Campaign live</h2>
    <div style="margin:12px 0;padding:12px 14px;background:#f7f7f5;border-radius:8px;font-size:14px;line-height:1.6">
      <div><span style="color:#888">School:</span> <strong>${esc(n.schoolName)}</strong></div>
      <div><span style="color:#888">Campaign:</span> ${esc(n.campaignTitle)}</div>
      <div><span style="color:#888">Deadline:</span> ${esc(deadline)}</div>
      <div><span style="color:#888">Page:</span> <a href="${url}">${url}</a></div>
    </div>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead><tr style="text-align:left;color:#555;font-size:12px;text-transform:uppercase">
        <th style="padding:6px 10px">SKU</th><th style="padding:6px 10px">Item</th>
        <th style="padding:6px 10px;text-align:center">Qty</th>
        <th style="padding:6px 10px;text-align:right">Unit</th>
        <th style="padding:6px 10px;text-align:right">Total</th>
      </tr></thead>
      <tbody>${htmlRows}</tbody>
      <tfoot><tr>
        <td colspan="4" style="padding:10px;text-align:right;font-weight:bold">Total value</td>
        <td style="padding:10px;text-align:right;font-weight:bold">${money(n.total)}</td>
      </tr></tfoot>
    </table>
    <p style="font-size:12px;color:#999">— Kit Up admin</p>
  </div>`;

  return sendAdminEmail(subject, text, html);
}

export interface SchoolProfileNotice {
  campaignTitle: string;
  schoolName: string;
  demographics: SchoolDemographics | null;
  impact: CampaignImpact | null;
  lines: { itemTitle: string; quantity: number; amount: number }[];
  total: number;
  donorLabel: string;
  sessionId: string;
  dateISO: string;
}

/**
 * ASF "school profile & impact" email — per campaign funded in a donation.
 * Combines the school's ACARA equity markers, the school-provided need/impact
 * answers, and what this donation funded, so ASF has grant/impact context.
 */
export async function notifyAdminSchoolProfile(
  n: SchoolProfileNotice,
): Promise<boolean> {
  const date = new Date(n.dateISO).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const ref = n.sessionId.slice(-10).toUpperCase();
  const subject = `[Kit Up] School profile & impact — ${n.schoolName}`;

  const demoRows = demoRowsFor(n.demographics);
  const { rows: impactRows, hasImpact } = impactRowsFor(n.impact);

  const text = `KIT UP — SCHOOL PROFILE & IMPACT
${date} · Ref KU-${ref}

Campaign: ${n.campaignTitle}
School:   ${n.schoolName}

SCHOOL PROFILE (ACARA):
${demoRows.length ? txtRows(demoRows) : "  (not available)"}

THE NEED & IMPACT (school-provided):
${hasImpact ? txtRows(impactRows) : "  (no impact details provided)"}

FUNDED IN THIS DONATION:
${n.lines.map((l) => `  • ${l.itemTitle}: ${l.quantity} × = ${money(l.amount)}`).join("\n")}
  ${"".padEnd(38)} Total: ${money(n.total)}

Donor: ${n.donorLabel}
Stripe session: ${n.sessionId}

— Kit Up / ASF admin`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;color:#1a1a1a">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <h2 style="margin:0;color:#e5533c">Kit Up — School profile &amp; impact</h2>
      <div style="text-align:right;font-size:13px;color:#555">${date}<br>Ref KU-${ref}</div>
    </div>
    <p style="font-size:14px;margin:6px 0 0"><strong>${esc(n.schoolName)}</strong> · ${esc(n.campaignTitle)}</p>
    <h3 style="font-size:15px;margin:16px 0 2px">School profile (ACARA)</h3>
    ${demoRows.length ? htmlTable(demoRows) : '<p style="font-size:13px;color:#888">Not available.</p>'}
    <h3 style="font-size:15px;margin:16px 0 2px">The need &amp; impact <span style="font-weight:400;color:#888;font-size:13px">(school-provided)</span></h3>
    ${hasImpact ? htmlTable(impactRows) : '<p style="font-size:13px;color:#888">No impact details provided.</p>'}
    <h3 style="font-size:15px;margin:16px 0 2px">Funded in this donation</h3>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <tbody>${n.lines
        .map(
          (l) =>
            `<tr><td style="padding:5px 10px;border-bottom:1px solid #eee">${esc(l.itemTitle)}</td><td style="padding:5px 10px;border-bottom:1px solid #eee;text-align:center">${l.quantity}</td><td style="padding:5px 10px;border-bottom:1px solid #eee;text-align:right">${money(l.amount)}</td></tr>`,
        )
        .join("")}</tbody>
      <tfoot><tr><td colspan="2" style="padding:8px 10px;text-align:right;font-weight:bold">Total</td><td style="padding:8px 10px;text-align:right;font-weight:bold">${money(n.total)}</td></tr></tfoot>
    </table>
    <p style="font-size:13px;color:#555">Donor: ${esc(n.donorLabel)} · Stripe session <code>${esc(n.sessionId)}</code></p>
    <p style="font-size:12px;color:#999">— Kit Up / ASF admin</p>
  </div>`;

  return sendAdminEmail(subject, text, html);
}

export interface DonationReceiptLine {
  campaignTitle: string;
  itemTitle: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
}

/** Per-campaign school profile (ACARA) + need/impact, for the ASF email. */
export interface DonationProfileSection {
  campaignTitle: string;
  schoolName: string | null;
  demographics: SchoolDemographics | null;
  impact: CampaignImpact | null;
}

export interface DonationReceipt {
  donorName: string | null;
  donorEmail: string | null;
  anonymous: boolean;
  sessionId: string;
  dateISO: string;
  lines: DonationReceiptLine[];
  donationTotal: number;
  /** Optional "Help cover our fundraising costs" fee, if the donor added it. */
  feeTotal?: number | null;
  totalCharged?: number | null;
  /** School profile (ACARA) + need/impact per funded campaign (ASF context). */
  profiles?: DonationProfileSection[];
}

/**
 * "Donation received" receipt to the admin — donor identity + what they funded
 * + total donated. Sent once per donation, separate from the per-school order
 * invoice (which is addressed to the school for dispatch).
 */
export async function notifyAdminDonationReceipt(
  r: DonationReceipt,
): Promise<boolean> {
  const date = new Date(r.dateISO).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const ref = r.sessionId.slice(-10).toUpperCase();
  const donor = r.donorName || "(name not given)";
  const emailAddr = r.donorEmail || "(email not given)";
  const subject = `[Kit Up] Donation received — ${money(r.donationTotal)} from ${donor}`;
  const hasFee = typeof r.feeTotal === "number" && r.feeTotal > 0.005;

  const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
  const rows = r.lines
    .map(
      (l) =>
        `  • ${l.campaignTitle} — ${l.itemTitle}${l.sku ? ` [${l.sku}]` : ""}: ${l.quantity} × ${money(l.unitPrice)} = ${money(l.amount)}`,
    )
    .join("\n");

  // School profile (ACARA) + need/impact per funded campaign — for ASF.
  const sections = r.profiles ?? [];
  const profileText = sections.length
    ? "\n" +
      sections
        .map((s) => {
          const demoRows = demoRowsFor(s.demographics);
          const { rows: impactRows, hasImpact } = impactRowsFor(s.impact);
          return `SCHOOL PROFILE & IMPACT — ${s.campaignTitle}${s.schoolName ? ` (${s.schoolName})` : ""}
  School profile (ACARA):
${demoRows.length ? txtRows(demoRows) : "    (not available)"}
  The need & impact (school-provided):
${hasImpact ? txtRows(impactRows) : "    (no impact details provided)"}`;
        })
        .join("\n\n")
    : "";
  const profileHtml = sections.length
    ? sections
        .map((s) => {
          const demoRows = demoRowsFor(s.demographics);
          const { rows: impactRows, hasImpact } = impactRowsFor(s.impact);
          return `<div style="margin-top:14px">
      <h3 style="font-size:15px;margin:0 0 2px">${esc(s.campaignTitle)}${s.schoolName ? ` <span style="font-weight:400;color:#888;font-size:13px">· ${esc(s.schoolName)}</span>` : ""}</h3>
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#888;margin-top:6px">School profile (ACARA)</div>
      ${demoRows.length ? htmlTable(demoRows) : '<p style="font-size:13px;color:#888">Not available.</p>'}
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#888">The need &amp; impact <span style="text-transform:none;letter-spacing:0">(school-provided)</span></div>
      ${hasImpact ? htmlTable(impactRows) : '<p style="font-size:13px;color:#888">No impact details provided.</p>'}
    </div>`;
        })
        .join("")
    : "";

  const text = `KIT UP — DONATION RECEIVED
${date} · Ref KU-${ref}

Donor:  ${donor}${r.anonymous ? "  (anonymous to public)" : ""}
Email:  ${emailAddr}

Items funded:
${rows}

Total donated: ${money(r.donationTotal)}${
    hasFee
      ? `\nFundraising costs: ${money(r.feeTotal as number)}\nTotal charged: ${money(r.totalCharged ?? r.donationTotal + (r.feeTotal as number))}`
      : ""
  }
${profileText}
Stripe session: ${r.sessionId}

— You're receiving this as the Kit Up / ASF admin.`;

  const htmlRows = r.lines
    .map(
      (l) => `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(l.campaignTitle)} — ${esc(l.itemTitle)}${l.sku ? ` <span style="color:#888;font-family:monospace;font-size:12px">[${esc(l.sku)}]</span>` : ""}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${l.quantity}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${money(l.amount)}</td>
    </tr>`,
    )
    .join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;color:#1a1a1a">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <h2 style="margin:0;color:#e5533c">Kit Up — Donation received</h2>
      <div style="text-align:right;font-size:13px;color:#555">${date}<br>Ref KU-${ref}</div>
    </div>
    <div style="margin:14px 0;padding:12px 14px;background:#f7f7f5;border-radius:8px;font-size:14px;line-height:1.5">
      <div><span style="color:#888">Donor:</span> <strong>${esc(donor)}</strong>${r.anonymous ? ' <span style="color:#888">(anonymous to public)</span>' : ""}</div>
      <div><span style="color:#888">Email:</span> ${esc(emailAddr)}</div>
    </div>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead><tr style="text-align:left;color:#555;font-size:12px;text-transform:uppercase">
        <th style="padding:6px 10px">Item</th>
        <th style="padding:6px 10px;text-align:center">Qty</th>
        <th style="padding:6px 10px;text-align:right">Amount</th>
      </tr></thead>
      <tbody>${htmlRows}</tbody>
      <tfoot>
        <tr><td colspan="2" style="padding:8px 10px;text-align:right;font-weight:bold">Total donated</td><td style="padding:8px 10px;text-align:right;font-weight:bold">${money(r.donationTotal)}</td></tr>
        ${
          hasFee
            ? `<tr><td colspan="2" style="padding:2px 10px;text-align:right;color:#555">Fundraising costs</td><td style="padding:2px 10px;text-align:right;color:#555">${money(r.feeTotal as number)}</td></tr>
        <tr><td colspan="2" style="padding:2px 10px;text-align:right;color:#555">Total charged</td><td style="padding:2px 10px;text-align:right;color:#555">${money(r.totalCharged ?? r.donationTotal + (r.feeTotal as number))}</td></tr>`
            : ""
        }
      </tfoot>
    </table>
    ${
      sections.length
        ? `<h2 style="font-size:16px;color:#e5533c;margin:22px 0 2px">School profile &amp; impact</h2>${profileHtml}`
        : ""
    }
    <p style="font-size:13px;color:#555;margin-top:16px">Stripe session <code>${esc(r.sessionId)}</code></p>
    <p style="font-size:12px;color:#999">— You're receiving this as the Kit Up / ASF admin.</p>
  </div>`;

  // Donation received → ASF.
  return sendEmail(ASF_RECIPIENT, subject, text, html);
}

export interface ReconcileLine {
  dateISO: string;
  invoiceRef: string;
  sku: string | null;
  itemTitle: string;
  quantity: number;
  amount: number;
}

export interface ReconcileReport {
  campaignTitle: string;
  reason: "fully funded" | "deadline reached" | "closed early";
  schoolName: string | null;
  deliveryAddress: string | null;
  deliveryConfirmed: boolean;
  abn: string | null;
  abnEntityName: string | null;
  reportRef: string;
  dateISO: string;
  lines: ReconcileLine[];
  total: number;
  itemsFunded: number;
  itemsTotal: number;
  donationCount: number;
  /** ACARA equity markers for the school (null until registry is populated). */
  demographics: SchoolDemographics | null;
  /** School-provided need/impact answers (null if none captured). */
  impact: CampaignImpact | null;
  /**
   * Per-dollar mode only: the fulfilment split — items fully funded (buy & ship)
   * vs partially funded (their contributions become one Hart Sport gift card).
   * Null in whole-unit mode (the purchase ledger above is used instead).
   */
  fulfilment?: {
    items: {
      title: string;
      sku: string | null;
      totalCost: number;
      raised: number;
      funded: boolean;
    }[];
    giftCardTotal: number;
  } | null;
}

/**
 * Campaign reconciliation email (sent once, when a campaign closes). A ledger
 * of every funded purchase — date funded, the donor invoice number it came
 * under, SKU, amount — plus a dispatch column, so ASF can dispatch each item
 * and reconcile it against payments received.
 */
export async function notifyAdminReconciliation(
  r: ReconcileReport,
): Promise<boolean> {
  const dshort = (iso: string) =>
    new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short" });
  const dfull = new Date(r.dateISO).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const subject = `[Kit Up] Reconciliation — ${r.campaignTitle} — ${money(r.total)}`;
  const deliveryNote = r.deliveryConfirmed
    ? "Delivery address confirmed by the school ✓"
    : "Delivery address auto-detected from ACARA — confirm before shipping.";

  const demoRows = demoRowsFor(r.demographics);
  const { rows: impactRows, hasImpact } = impactRowsFor(r.impact);

  const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
  const clip = (s: string, n: number) =>
    s.length > n - 1 ? s.slice(0, n - 2) + "…" : s;
  const rows = r.lines
    .map(
      (l) =>
        "  " +
        pad(dshort(l.dateISO), 8) +
        pad(l.invoiceRef, 14) +
        pad(l.sku ?? "—", 10) +
        pad(clip(l.itemTitle, 28), 28) +
        pad(String(l.quantity), 4) +
        pad(money(l.amount), 10) +
        "[ ]",
    )
    .join("\n");
  // Body = per-dollar fulfilment split, or the whole-unit purchase ledger.
  const f = r.fulfilment;
  const fulfilmentText = f
    ? `Funds raised: ${money(r.total)}   Items fully funded: ${r.itemsFunded}/${r.itemsTotal}   Donations: ${r.donationCount}

PURCHASE & SHIP (fully funded — buy from catalogue & deliver):
${
  f.items.filter((x) => x.funded).length
    ? f.items
        .filter((x) => x.funded)
        .map((x) => `  ${pad(x.sku ?? "—", 10)}${clip(x.title, 40)} — ${money(x.totalCost)}`)
        .join("\n")
    : "  (none)"
}

PARTIALLY FUNDED (not shipped — contributions go to the gift card):
${
  f.items.filter((x) => !x.funded).length
    ? f.items
        .filter((x) => !x.funded)
        .map((x) => `  ${pad(x.sku ?? "—", 10)}${clip(x.title, 30)} ${money(x.raised)} of ${money(x.totalCost)}`)
        .join("\n")
    : "  (none)"
}

HART SPORT GIFT CARD for the school: ${money(f.giftCardTotal)}
  (= the total contributed to the partially-funded items above)`
    : `Items funded: ${r.itemsFunded}/${r.itemsTotal}   Donations: ${r.donationCount}   Total: ${money(r.total)}

  ${pad("FUNDED", 8)}${pad("INVOICE", 14)}${pad("SKU", 10)}${pad("ITEM", 28)}${pad("QTY", 4)}${pad("AMOUNT", 10)}SENT
  ${"-".repeat(77)}
${rows}
  ${"-".repeat(77)}
  ${pad("", 60)}TOTAL: ${money(r.total)}`;
  const closingNote = f
    ? "Buy & ship the fully-funded items, and issue the school a Hart Sport gift card for the amount shown. ASF issues the donor receipts and transfers funds."
    : "Tick each line as it's dispatched. Each row references the donor invoice it was funded under, for reconciliation against payments received.";

  const text = `KIT UP — CAMPAIGN RECONCILIATION
Report ${r.reportRef} · ${dfull} · closed: ${r.reason}

Campaign: ${r.campaignTitle}

DELIVER TO:
  ${r.schoolName ?? "—"}
  ${r.deliveryAddress ?? "(no delivery address on file)"}
  ABN: ${r.abn ?? "—"}${r.abnEntityName ? `  (${r.abnEntityName})` : ""}
  ${deliveryNote}

SCHOOL PROFILE (ACARA):
${demoRows.length ? txtRows(demoRows) : "  (not available)"}

THE NEED & IMPACT (school-provided):
${hasImpact ? txtRows(impactRows) : "  (no impact details provided)"}

${fulfilmentText}

${closingNote}

— Kit Up / ASF admin`;

  const htmlRows = r.lines
    .map(
      (l) => `<tr>
      <td style="padding:7px 8px;border-bottom:1px solid #eee">${dshort(l.dateISO)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${esc(l.invoiceRef)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${esc(l.sku ?? "—")}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee">${esc(l.itemTitle)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:center">${l.quantity}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:right">${money(l.amount)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:center;color:#999">☐</td>
    </tr>`,
    )
    .join("");
  const cellTd = 'style="padding:7px 8px;border-bottom:1px solid #eee"';
  const fulfilmentHtml = f
    ? `<p style="font-size:14px;color:#555;margin:14px 0 8px">Funds raised ${money(r.total)} · ${r.itemsFunded}/${r.itemsTotal} items fully funded · ${r.donationCount} donations</p>
    <h3 style="font-size:15px;margin:16px 0 4px">Purchase &amp; ship <span style="font-weight:400;color:#888;font-size:13px">(fully funded)</span></h3>
    ${
      f.items.filter((x) => x.funded).length
        ? `<table style="border-collapse:collapse;width:100%;font-size:14px"><tbody>${f.items
            .filter((x) => x.funded)
            .map(
              (x) => `<tr><td ${cellTd};font-family:monospace;font-size:12px>${esc(x.sku ?? "—")}</td><td ${cellTd}>${esc(x.title)}</td><td ${cellTd};text-align:right>${money(x.totalCost)}</td></tr>`,
            )
            .join("")}</tbody></table>`
        : '<p style="font-size:13px;color:#888">None fully funded.</p>'
    }
    <h3 style="font-size:15px;margin:16px 0 4px">Partially funded <span style="font-weight:400;color:#888;font-size:13px">(not shipped — value goes to the gift card)</span></h3>
    ${
      f.items.filter((x) => !x.funded).length
        ? `<table style="border-collapse:collapse;width:100%;font-size:14px"><tbody>${f.items
            .filter((x) => !x.funded)
            .map(
              (x) => `<tr><td ${cellTd};font-family:monospace;font-size:12px>${esc(x.sku ?? "—")}</td><td ${cellTd}>${esc(x.title)}</td><td ${cellTd};text-align:right>${money(x.raised)} <span style="color:#888">of ${money(x.totalCost)}</span></td></tr>`,
            )
            .join("")}</tbody></table>`
        : '<p style="font-size:13px;color:#888">None.</p>'
    }
    <div style="margin:16px 0;padding:12px 14px;background:#fff6ed;border:1px solid #f1c7a8;border-radius:8px">
      <strong style="font-size:15px">Hart Sport gift card for ${esc(r.schoolName ?? "the school")}: ${money(f.giftCardTotal)}</strong>
      <div style="font-size:13px;color:#555;margin-top:2px">= the total contributed to the partially-funded items above.</div>
    </div>`
    : `<p style="font-size:14px;color:#555;margin:14px 0 8px">Items funded ${r.itemsFunded}/${r.itemsTotal} · ${r.donationCount} donations · total ${money(r.total)}</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead><tr style="text-align:left;color:#555;font-size:12px;text-transform:uppercase">
        <th style="padding:7px 8px">Funded</th><th style="padding:7px 8px">Invoice</th>
        <th style="padding:7px 8px">SKU</th><th style="padding:7px 8px">Item</th>
        <th style="padding:7px 8px;text-align:center">Qty</th>
        <th style="padding:7px 8px;text-align:right">Amount</th>
        <th style="padding:7px 8px;text-align:center">Dispatched</th>
      </tr></thead>
      <tbody>${htmlRows}</tbody>
      <tfoot><tr>
        <td colspan="5" style="padding:10px 8px;text-align:right;font-weight:bold">Total funded</td>
        <td style="padding:10px 8px;text-align:right;font-weight:bold">${money(r.total)}</td><td></td>
      </tr></tfoot>
    </table>`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;color:#1a1a1a">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <h2 style="margin:0;color:#e5533c">Kit Up — Campaign reconciliation</h2>
      <div style="text-align:right;font-size:13px;color:#555">${dfull}<br>Report ${esc(r.reportRef)}</div>
    </div>
    <p style="font-size:14px;color:#555;margin:6px 0 0">${esc(r.campaignTitle)} · closed: ${esc(r.reason)}</p>
    <div style="margin:14px 0;padding:12px 14px;background:#f7f7f5;border-radius:8px;font-size:14px;line-height:1.5">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#888">Deliver to</div>
      <div style="font-weight:bold">${esc(r.schoolName ?? "—")}</div>
      <div>${esc(r.deliveryAddress ?? "(no delivery address on file)")}</div>
      <div>ABN: ${esc(r.abn ?? "—")}${r.abnEntityName ? ` <span style="color:#555">(${esc(r.abnEntityName)})</span>` : ""}</div>
      <div style="font-size:13px;margin-top:4px;color:${r.deliveryConfirmed ? "#2e7d32" : "#b26a00"}">${esc(deliveryNote)}</div>
    </div>
    <h3 style="font-size:15px;margin:16px 0 2px">School profile (ACARA)</h3>
    ${demoRows.length ? htmlTable(demoRows) : '<p style="font-size:13px;color:#888">Not available.</p>'}
    <h3 style="font-size:15px;margin:16px 0 2px">The need &amp; impact <span style="font-weight:400;color:#888;font-size:13px">(school-provided)</span></h3>
    ${hasImpact ? htmlTable(impactRows) : '<p style="font-size:13px;color:#888">No impact details provided.</p>'}
    ${fulfilmentHtml}
    <p style="font-size:13px;color:#555;margin-top:12px">${esc(closingNote)}</p>
    <p style="font-size:12px;color:#999">— Kit Up / ASF admin</p>
  </div>`;

  // Reconciliation → both the supplier (Modern Star) and ASF.
  return sendEmail([ASF_RECIPIENT, SUPPLIER_RECIPIENT], subject, text, html);
}

export interface FundedItem {
  title: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface FundedNotice {
  campaignTitle: string;
  schoolName: string | null;
  amountRaised: number;
  items: FundedItem[];
}

export async function notifyAdminCampaignFunded(
  n: FundedNotice,
): Promise<boolean> {
  const subject = `[Kit Up] 🎉 Campaign fully funded — ${n.campaignTitle}`;
  const itemised = n.items
    .map(
      (it) =>
        `  • ${it.title}: ${it.quantity} × ${money(it.unitPrice)} = ${money(
          it.lineTotal,
        )}`,
    )
    .join("\n");
  const text = `Great news — a campaign has reached its goal.

Campaign: ${n.campaignTitle}
School:   ${n.schoolName ?? "—"}

Items funded (item: qty × unit price = total):
${itemised}

Total raised: ${money(n.amountRaised)}

Every item is now funded — time to arrange the order.

— You're receiving this as the Kit Up / ASF admin.`;
  return sendEmail(ASF_RECIPIENT, subject, text);
}

export interface AbnMismatchNotice {
  schoolName: string;
  postcode: string | null;
  abn: string | null;
  entityName: string | null;
  schoolId: string;
}

/**
 * Admin alert: a school passed ACARA verification at sign-up, but its ABN is
 * registered to a DIFFERENT entity (and isn't a known shared government ABN).
 * The account is allowed (ACARA proves the school); abn_verified is left false.
 * Admin reviews — and if it's a legitimate shared ABN, adds it to
 * SHARED_GOV_ABNS in lib/abr.ts. Best-effort.
 */
export async function notifyAdminAbnMismatch(
  n: AbnMismatchNotice,
): Promise<boolean> {
  const subject = `[Kit Up] ABN needs review — ${n.schoolName}`;
  const text = `A school signed up and passed ACARA verification (name + postcode),
but its ABN is registered to a different entity and isn't a known shared
government ABN. The account was created; abn_verified is false pending review.

School:             ${n.schoolName}
Postcode:           ${n.postcode ?? "—"}
ABN provided:       ${n.abn ?? "—"}
ABN registered to:  ${n.entityName ?? "—"}
School id:          ${n.schoolId}

If this is a legitimate shared ABN (e.g. a state education department), add it to
SHARED_GOV_ABNS in lib/abr.ts. Otherwise follow up with the school.

— Kit Up / ASF admin`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;color:#1a1a1a">
    <h2 style="margin:0;color:#e5533c">Kit Up — ABN needs review</h2>
    <p style="font-size:14px;line-height:1.5;margin:12px 0">A school passed ACARA verification (name + postcode) at sign-up, but its ABN is registered to a <strong>different entity</strong> and isn't a known shared government ABN. The account was created; <code>abn_verified</code> is false pending review.</p>
    <table style="border-collapse:collapse;font-size:14px;margin:4px 0 12px">
      <tr><td style="padding:3px 12px 3px 0;color:#888">School</td><td style="padding:3px 0;font-weight:600">${esc(n.schoolName)}</td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#888">Postcode</td><td style="padding:3px 0">${esc(n.postcode ?? "—")}</td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#888">ABN provided</td><td style="padding:3px 0">${esc(n.abn ?? "—")}</td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#888">ABN registered to</td><td style="padding:3px 0;font-weight:600">${esc(n.entityName ?? "—")}</td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#888">School id</td><td style="padding:3px 0;font-family:monospace;font-size:12px">${esc(n.schoolId)}</td></tr>
    </table>
    <p style="font-size:13px;line-height:1.5;color:#555">If this is a legitimate shared ABN (e.g. a state education department), add it to <code>SHARED_GOV_ABNS</code> in <code>lib/abr.ts</code>. Otherwise follow up with the school.</p>
    <p style="font-size:12px;color:#999">— Kit Up / ASF admin</p>
  </div>`;
  return sendAdminEmail(subject, text, html);
}

export interface DonorThankYouLine {
  campaignTitle: string;
  schoolName: string | null;
  itemTitle: string;
  quantity: number;
  amount: number;
  /** Whether the item is fully funded as of this donation (else partially). */
  fullyFunded: boolean;
}

/** Per-campaign impact note, shown warmly to the donor. Only rendered when it
 *  has content. */
export interface DonorImpactSection {
  campaignTitle: string;
  schoolName: string | null;
  studentsReached: number | null;
  barrier: string;
  usageContext: string;
  usageFrequency: string;
  participationGoal: string;
}

export interface DonorThankYou {
  donorName: string | null;
  donorEmail: string;
  lines: DonorThankYouLine[];
  /** Per-campaign impact notes (only ones with content get rendered). */
  impacts: DonorImpactSection[];
  /** The donation itself (excludes the optional fundraising-costs fee). */
  donationTotal: number;
  /** The "cover our costs" fee, if the donor opted in — else null. */
  feeTotal: number | null;
  dateISO: string;
  sessionId: string;
}

/**
 * Warm thank-you to the donor, from Kit Up — sent to the donor's own email after
 * a donation is recorded. This is a thank-you, NOT the tax receipt: the ASF
 * issues the tax-deductible receipt separately. Best-effort; never throws.
 */
export async function notifyDonorThankYou(n: DonorThankYou): Promise<boolean> {
  if (!n.donorEmail) return false;

  const firstName = (n.donorName ?? "").trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
  const date = new Date(n.dateISO).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  // Distinct schools helped, for the intro line.
  const schools = Array.from(
    new Set(n.lines.map((l) => l.schoolName).filter(Boolean) as string[]),
  );
  const schoolPhrase =
    schools.length === 0
      ? "a school on Kit Up"
      : schools.length === 1
        ? schools[0]
        : schools.length === 2
          ? `${schools[0]} and ${schools[1]}`
          : `${schools.slice(0, -1).join(", ")} and ${schools[schools.length - 1]}`;

  const subject =
    schools.length === 1
      ? `Thank you for supporting ${schools[0]} 🧡`
      : "Thank you for your Kit Up donation 🧡";

  const taxNote =
    "Through our partnership with the Australian Sports Foundation, any donation of $2 or more is tax deductible. The ASF will issue your tax-deductible receipt separately — this email is just our thank-you.";

  // --- partial-funding helpers ---
  const joinNames = (arr: string[]) =>
    arr.length === 0
      ? "the school"
      : arr.length === 1
        ? arr[0]
        : arr.length === 2
          ? `${arr[0]} and ${arr[1]}`
          : `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`;
  const partialLines = n.lines.filter((l) => !l.fullyFunded);
  const partialSchools = Array.from(
    new Set(partialLines.map((l) => l.schoolName).filter(Boolean) as string[]),
  );
  const anyPartial = partialLines.length > 0;
  const plural = partialLines.length > 1;

  // --- impact helpers ---
  const impactHas = (s: DonorImpactSection) =>
    Boolean(
      s.studentsReached ||
        s.barrier ||
        s.usageContext ||
        s.usageFrequency ||
        s.participationGoal,
    );
  const howUsed = (s: DonorImpactSection) => {
    const freq = s.usageFrequency
      ? s.usageFrequency.charAt(0).toLowerCase() + s.usageFrequency.slice(1)
      : "";
    return [s.usageContext, freq].filter(Boolean).join(", ");
  };
  const impactSections = n.impacts.filter(impactHas);

  // ---- plain text ----
  const statusText = (l: DonorThankYouLine) =>
    l.fullyFunded ? "fully funded" : "partially funded";
  const itemised = n.lines
    .map(
      (l) =>
        `  • ${l.itemTitle}${l.quantity > 1 ? ` × ${l.quantity}` : ""} — ${money(l.amount)} (${statusText(l)}) — ${l.campaignTitle}`,
    )
    .join("\n");
  const partialText = anyPartial
    ? `\nOne or more of the items you gave to aren't fully funded just yet. We'll let ${joinNames(partialSchools)} know ${plural ? "they're" : "it's"} partially funded. If an item isn't fully funded by the time its campaign closes, your contribution goes to the school as a Hart Sport gift card — so not a cent is wasted and it still buys sports gear for the students.\n`
    : "";
  const impactText = impactSections
    .map((s) => {
      const where = s.schoolName ?? s.campaignTitle;
      const rows = [`Your impact at ${where}:`];
      if (s.studentsReached)
        rows.push(`  Your gift helps up to ${s.studentsReached} students get active.`);
      if (s.barrier) rows.push(`  Why it's needed: ${s.barrier}`);
      const how = howUsed(s);
      if (how) rows.push(`  How it'll be used: ${how}`);
      if (s.participationGoal) rows.push(`  The goal: ${s.participationGoal}`);
      return rows.join("\n");
    })
    .join("\n\n");
  const feeLine =
    n.feeTotal && n.feeTotal > 0.005
      ? `\nYou also chipped in ${money(n.feeTotal)} to help cover our platform costs — thank you, that genuinely helps keep Kit Up running.\n`
      : "";
  const text = `${greeting}

Thank you so much for your donation to ${schoolPhrase} through Kit Up. Because of you, real kit is on its way to students who need it.

Here's what you funded:
${itemised}

  Your donation: ${money(n.donationTotal)}
${partialText}${impactText ? `\n${impactText}\n` : ""}${feeLine}
${taxNote}

Thank you for backing local schools.

— The Kit Up team
${date} · Ref KU-${n.sessionId.slice(-10).toUpperCase()}`;

  // ---- HTML ----
  const chip = (full: boolean) =>
    full
      ? `<span style="display:inline-block;margin-top:5px;font-size:11px;font-weight:700;color:#1f7a4d;background:#e6f4ec;border-radius:999px;padding:2px 9px">✓ Fully funded</span>`
      : `<span style="display:inline-block;margin-top:5px;font-size:11px;font-weight:700;color:#b26a00;background:#fbf0dd;border-radius:999px;padding:2px 9px">◐ Partially funded</span>`;
  const rows = n.lines
    .map(
      (l) => `<tr>
      <td style="padding:7px 8px;border-bottom:1px solid #eee">${esc(l.itemTitle)}${l.quantity > 1 ? ` <span style="color:#888">× ${l.quantity}</span>` : ""}<div style="font-size:12px;color:#888">${esc(l.campaignTitle)}</div>${chip(l.fullyFunded)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;vertical-align:top">${money(l.amount)}</td>
    </tr>`,
    )
    .join("");
  const partialHtml = anyPartial
    ? `<div style="font-size:13px;line-height:1.55;color:#6b4a12;margin:14px 0;padding:12px 14px;background:#fbf0dd;border-radius:8px"><strong>About the partially funded item${plural ? "s" : ""}</strong><br>One or more of the items you gave to aren't fully funded just yet. We'll let ${esc(joinNames(partialSchools))} know ${plural ? "they're" : "it's"} partially funded. If an item isn't fully funded by the time its campaign closes, your contribution goes to the school as a Hart Sport gift card — so not a cent is wasted and it still buys sports gear for the students.</div>`
    : "";
  const impactHtml = impactSections
    .map((s) => {
      const where = esc(s.schoolName ?? s.campaignTitle);
      const detailRows: [string, string][] = [];
      if (s.barrier) detailRows.push(["Why it's needed", s.barrier]);
      const how = howUsed(s);
      if (how) detailRows.push(["How it'll be used", how]);
      if (s.participationGoal) detailRows.push(["The goal", s.participationGoal]);
      const lead = s.studentsReached
        ? `Your gift helps up to <strong>${s.studentsReached} students</strong> get active. Here's what the school told us about why it matters:`
        : `Here's what the school told us about why it matters:`;
      const tbl = detailRows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:3px 10px 3px 0;color:#9a5a49;vertical-align:top">${esc(k)}</td><td style="padding:3px 0">${esc(v)}</td></tr>`,
        )
        .join("");
      return `<div style="margin:18px 0;padding:14px 16px;background:#fff4f1;border:1px solid #f6d7cd;border-radius:10px">
      <h3 style="font-size:14px;margin:0 0 8px;color:#e5533c">Your impact at ${where}</h3>
      <p style="font-size:14px;line-height:1.55;margin:0 0 8px;color:#1a1a1a">${lead}</p>
      ${tbl ? `<table style="border-collapse:collapse;font-size:13.5px;line-height:1.5">${tbl}</table>` : ""}
    </div>`;
    })
    .join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1a1a1a">
    <h2 style="margin:0 0 4px;color:#e5533c">Thank you! 🧡</h2>
    <p style="font-size:15px;line-height:1.5;margin:12px 0">${esc(greeting)}</p>
    <p style="font-size:15px;line-height:1.5;margin:12px 0">Thank you so much for your donation to <strong>${esc(schoolPhrase)}</strong> through Kit Up. Because of you, real kit is on its way to students who need it.</p>
    <h3 style="font-size:14px;margin:18px 0 4px;color:#555">What you funded</h3>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td style="padding:9px 8px;text-align:right;font-weight:bold">Your donation</td>
        <td style="padding:9px 8px;text-align:right;font-weight:bold;white-space:nowrap">${money(n.donationTotal)}</td>
      </tr></tfoot>
    </table>
    ${partialHtml}
    ${impactHtml}
    ${
      n.feeTotal && n.feeTotal > 0.005
        ? `<p style="font-size:13px;line-height:1.5;color:#555;margin:12px 0">You also chipped in <strong>${money(n.feeTotal)}</strong> to help cover our platform costs — thank you, that genuinely helps keep Kit Up running.</p>`
        : ""
    }
    <p style="font-size:13px;line-height:1.5;color:#555;margin:16px 0;padding:12px 14px;background:#f7f7f5;border-radius:8px">${esc(taxNote)}</p>
    <p style="font-size:15px;line-height:1.5;margin:12px 0">Thank you for backing local schools.</p>
    <p style="font-size:14px;margin:18px 0 2px">— The Kit Up team</p>
    <p style="font-size:12px;color:#999;margin:0">${date} · Ref KU-${esc(n.sessionId.slice(-10).toUpperCase())}</p>
  </div>`;

  return sendEmail(n.donorEmail, subject, text, html, KITUP_FROM_EMAIL);
}

/**
 * Welcome email from Kit Up to a newly signed-up user (school or donor). Sent
 * to the user's own address from hello@kitup.tech. Best-effort; never throws.
 */
export async function notifyUserWelcome(n: {
  email: string;
  role: "school" | "donor";
  name: string | null;
}): Promise<boolean> {
  if (!n.email) return false;
  const firstName = (n.name ?? "").trim().split(/\s+/)[0] || "";

  if (n.role === "school") {
    const greeting = n.name ? `Hi ${esc(n.name)} team,` : "Hi there,";
    const subject = "Welcome to Kit Up 🎉";
    const dash = `${APP_URL}/dashboard`;
    const text = `${n.name ? `Hi ${n.name} team,` : "Hi there,"}

Welcome to Kit Up — thanks for signing up! Kit Up helps your school raise the
sports gear you need, funded by your community item by item.

Here's how to get started:
  1. Create a campaign and add the kit you need from the catalogue.
  2. Add a photo and tell your community why it matters.
  3. Post it — then share the link. Donors fund each item until you're there.

Create your first campaign: ${dash}

Every donation is processed through the Australian Sports Foundation, so your
supporters' gifts of $2 or more are tax deductible.

Thanks for backing local sport.

— The Kit Up team`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1a1a1a">
    <h2 style="margin:0 0 4px;color:#e5533c">Welcome to Kit Up 🎉</h2>
    <p style="font-size:15px;line-height:1.5;margin:12px 0">${greeting}</p>
    <p style="font-size:15px;line-height:1.5;margin:12px 0">Thanks for signing up! Kit Up helps your school raise the sports gear you need, funded by your community item by item.</p>
    <h3 style="font-size:14px;margin:18px 0 6px;color:#555">Getting started</h3>
    <ol style="font-size:15px;line-height:1.6;margin:0 0 16px;padding-left:20px">
      <li>Create a campaign and add the kit you need from the catalogue.</li>
      <li>Add a photo and tell your community why it matters.</li>
      <li>Post it — then share the link. Donors fund each item until you're there.</li>
    </ol>
    <p style="margin:18px 0"><a href="${dash}" style="display:inline-block;background:#e5533c;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;padding:11px 20px;border-radius:9999px">Create your first campaign</a></p>
    <p style="font-size:13px;line-height:1.5;color:#555;margin:16px 0;padding:12px 14px;background:#f7f7f5;border-radius:8px">Every donation is processed through the Australian Sports Foundation, so your supporters' gifts of $2 or more are tax deductible.</p>
    <p style="font-size:15px;line-height:1.5;margin:12px 0">Thanks for backing local sport.</p>
    <p style="font-size:14px;margin:18px 0 2px">— The Kit Up team</p>
  </div>`;
    return sendEmail(n.email, subject, text, html, KITUP_FROM_EMAIL);
  }

  // Donor
  const greeting = firstName ? `Hi ${esc(firstName)},` : "Hi there,";
  const subject = "Welcome to Kit Up 🎉";
  const browse = `${APP_URL}/#browse`;
  const text = `${firstName ? `Hi ${firstName},` : "Hi there,"}

Welcome to Kit Up — thanks for joining! Kit Up lets you fund the exact sports
gear local schools need, item by item, so you can see precisely what your
donation buys.

Browse campaigns and back a school: ${browse}

Donations are processed through the Australian Sports Foundation, so any gift of
$2 or more is tax deductible — the ASF issues your receipt.

Thanks for backing local schools.

— The Kit Up team`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1a1a1a">
    <h2 style="margin:0 0 4px;color:#e5533c">Welcome to Kit Up 🎉</h2>
    <p style="font-size:15px;line-height:1.5;margin:12px 0">${greeting}</p>
    <p style="font-size:15px;line-height:1.5;margin:12px 0">Thanks for joining! Kit Up lets you fund the exact sports gear local schools need, item by item — so you can see precisely what your donation buys.</p>
    <p style="margin:18px 0"><a href="${browse}" style="display:inline-block;background:#e5533c;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;padding:11px 20px;border-radius:9999px">Browse campaigns</a></p>
    <p style="font-size:13px;line-height:1.5;color:#555;margin:16px 0;padding:12px 14px;background:#f7f7f5;border-radius:8px">Donations are processed through the Australian Sports Foundation, so any gift of $2 or more is tax deductible — the ASF issues your receipt.</p>
    <p style="font-size:15px;line-height:1.5;margin:12px 0">Thanks for backing local schools.</p>
    <p style="font-size:14px;margin:18px 0 2px">— The Kit Up team</p>
  </div>`;
  return sendEmail(n.email, subject, text, html, KITUP_FROM_EMAIL);
}

/** A colleague has been invited to co-manage a school (NEW Kit Up user). */
export async function notifyMemberInvite(n: {
  email: string;
  schoolName: string;
  roleLabel: string;
  setupLink: string;
}): Promise<boolean> {
  const subject = `You've been invited to help manage ${n.schoolName} on Kit Up`;
  const text = `Hi,

You've been added as ${n.roleLabel} for ${n.schoolName} on Kit Up — the platform ${n.schoolName} uses to raise sports gear.

Set your password to get started:
${n.setupLink}

(The link expires in about an hour. If it has, use "Forgot password" at ${APP_URL}/sign-in with this email address.)

— The Kit Up team

${KITUP_BLURB_TEXT}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1a1a1a">
    <h2 style="margin:0 0 4px;color:#e5533c">You've been invited to Kit Up</h2>
    <p style="font-size:15px;line-height:1.5;margin:12px 0">You've been added as <strong>${esc(n.roleLabel)}</strong> for <strong>${esc(n.schoolName)}</strong> on Kit Up — the platform the school uses to raise sports gear.</p>
    <p style="margin:18px 0"><a href="${esc(n.setupLink)}" style="display:inline-block;background:#e5533c;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;padding:11px 20px;border-radius:9999px">Set your password</a></p>
    <p style="font-size:13px;line-height:1.5;color:#555;margin:12px 0">The link expires in about an hour. If it has, use "Forgot password" at <a href="${APP_URL}/sign-in">${APP_URL}/sign-in</a> with this email address.</p>
    <p style="font-size:14px;margin:18px 0 2px">— The Kit Up team</p>
    ${KITUP_BLURB_HTML}
  </div>`;
  return sendEmail(n.email, subject, text, html, KITUP_FROM_EMAIL);
}

/** A colleague who already has a Kit Up account was added to a school. */
export async function notifyMemberAdded(n: {
  email: string;
  schoolName: string;
  roleLabel: string;
}): Promise<boolean> {
  const subject = `You've been added to ${n.schoolName} on Kit Up`;
  const text = `Hi,

You now have ${n.roleLabel} access to ${n.schoolName} on Kit Up. Sign in with this email to manage its campaigns:
${APP_URL}/sign-in

— The Kit Up team

${KITUP_BLURB_TEXT}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1a1a1a">
    <h2 style="margin:0 0 4px;color:#e5533c">You've been added to ${esc(n.schoolName)}</h2>
    <p style="font-size:15px;line-height:1.5;margin:12px 0">You now have <strong>${esc(n.roleLabel)}</strong> access to <strong>${esc(n.schoolName)}</strong> on Kit Up.</p>
    <p style="margin:18px 0"><a href="${APP_URL}/sign-in" style="display:inline-block;background:#e5533c;color:#fff;text-decoration:none;font-weight:bold;font-size:15px;padding:11px 20px;border-radius:9999px">Sign in</a></p>
    <p style="font-size:14px;margin:18px 0 2px">— The Kit Up team</p>
    ${KITUP_BLURB_HTML}
  </div>`;
  return sendEmail(n.email, subject, text, html, KITUP_FROM_EMAIL);
}
