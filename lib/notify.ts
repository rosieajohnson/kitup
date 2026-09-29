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
const ADMIN_RECIPIENT = "rosieajohnson@gmail.com";

function money(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(n);
}

async function sendAdminEmail(
  subject: string,
  text: string,
  html?: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`notify: RESEND_API_KEY not set — skipped "${subject}"`);
    return false;
  }
  const from = process.env.CONTACT_FROM_EMAIL || "Kit Up <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [ADMIN_RECIPIENT],
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

  return sendAdminEmail(subject, text, html);
}

export interface SchoolProfileNotice {
  campaignTitle: string;
  schoolName: string;
  demographics: {
    remoteness?: string | null;
    totalEnrolments?: number | null;
    icsea?: number | null;
    icseaPercentile?: number | null;
    seaBottomQuarter?: number | null;
    indigenousPct?: number | null;
    lbotePct?: number | null;
  } | null;
  impact: {
    studentsReached: number | null;
    barrier: string;
    studentsMissingOut: string;
    usageContext: string;
    usageFrequency: string;
    participationGoal: string;
  } | null;
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
  const dash = (v: unknown) =>
    v === null || v === undefined || v === "" ? "—" : String(v);
  const pct = (v: number | null | undefined) =>
    v === null || v === undefined ? "—" : `${v}%`;

  const d = n.demographics;
  const demoRows: [string, string][] = d
    ? [
        ["Remoteness", dash(d.remoteness)],
        ["Enrolments", dash(d.totalEnrolments)],
        [
          "ICSEA",
          d.icsea
            ? `${d.icsea}${d.icseaPercentile ? ` (percentile ${d.icseaPercentile})` : ""}`
            : "—",
        ],
        ["Most-disadvantaged quarter (low-SES)", pct(d.seaBottomQuarter)],
        ["First Nations students", pct(d.indigenousPct)],
        ["Language background other than English", pct(d.lbotePct)],
      ]
    : [];

  const i = n.impact;
  const impactRows: [string, string][] = i
    ? [
        ["Students reached", dash(i.studentsReached)],
        ["Barrier to self-funding", dash(i.barrier)],
        ["Who's missing out", dash(i.studentsMissingOut)],
        ["Where/how used", dash(i.usageContext)],
        ["How often", dash(i.usageFrequency)],
        ["Participation goal", dash(i.participationGoal)],
      ]
    : [];
  const hasImpact = impactRows.some(([, v]) => v !== "—");

  const txtRows = (rows: [string, string][]) =>
    rows.map(([k, v]) => `  ${(k + ":").padEnd(38)} ${v}`).join("\n");
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

  const htmlTable = (rows: [string, string][]) =>
    `<table style="border-collapse:collapse;font-size:14px;margin:4px 0 10px">${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:3px 12px 3px 0;color:#888">${esc(k)}</td><td style="padding:3px 0;font-weight:${v === "—" ? "400" : "500"}">${esc(v)}</td></tr>`,
      )
      .join("")}</table>`;
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
    <p style="font-size:13px;color:#555">Stripe session <code>${esc(r.sessionId)}</code></p>
    <p style="font-size:12px;color:#999">— You're receiving this as the Kit Up / ASF admin.</p>
  </div>`;

  return sendAdminEmail(subject, text, html);
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
  reason: "fully funded" | "deadline reached";
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
  const text = `KIT UP — CAMPAIGN RECONCILIATION
Report ${r.reportRef} · ${dfull} · closed: ${r.reason}

Campaign: ${r.campaignTitle}

DELIVER TO:
  ${r.schoolName ?? "—"}
  ${r.deliveryAddress ?? "(no delivery address on file)"}
  ABN: ${r.abn ?? "—"}${r.abnEntityName ? `  (${r.abnEntityName})` : ""}
  ${deliveryNote}

Items funded: ${r.itemsFunded}/${r.itemsTotal}   Donations: ${r.donationCount}   Total: ${money(r.total)}

  ${pad("FUNDED", 8)}${pad("INVOICE", 14)}${pad("SKU", 10)}${pad("ITEM", 28)}${pad("QTY", 4)}${pad("AMOUNT", 10)}SENT
  ${"-".repeat(77)}
${rows}
  ${"-".repeat(77)}
  ${pad("", 60)}TOTAL: ${money(r.total)}

Tick each line as it's dispatched. Each row references the donor invoice it was
funded under, for reconciliation against payments received.

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
    <p style="font-size:14px;color:#555;margin:0 0 8px">Items funded ${r.itemsFunded}/${r.itemsTotal} · ${r.donationCount} donations · total ${money(r.total)}</p>
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
    </table>
    <p style="font-size:13px;color:#555">Tick each line as it's dispatched. Each row references the donor invoice it was funded under, for reconciliation against payments received.</p>
    <p style="font-size:12px;color:#999">— Kit Up / ASF admin</p>
  </div>`;

  return sendAdminEmail(subject, text, html);
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
  return sendAdminEmail(subject, text);
}
