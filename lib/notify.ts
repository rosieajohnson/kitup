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
