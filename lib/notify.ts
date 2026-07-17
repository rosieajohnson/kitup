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

async function sendAdminEmail(subject: string, text: string): Promise<boolean> {
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
      body: JSON.stringify({ from, to: [ADMIN_RECIPIENT], subject, text }),
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

export interface DonationLine {
  campaignTitle: string;
  itemTitle: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface DonationNotice {
  donorLabel: string;
  total: number;
  sessionId: string;
  lines: DonationLine[];
}

export async function notifyAdminDonation(n: DonationNotice): Promise<boolean> {
  const campaigns = Array.from(new Set(n.lines.map((l) => l.campaignTitle)));
  const subject = `[Kit Up] New donation — ${money(n.total)} to ${
    campaigns.length === 1 ? campaigns[0] : `${campaigns.length} campaigns`
  }`;
  const items = n.lines
    .map(
      (l) =>
        `  • ${l.campaignTitle} — ${l.itemTitle}: ${l.quantity} × ${money(
          l.unitPrice,
        )} = ${money(l.amount)}`,
    )
    .join("\n");
  const text = `A donation was just made on Kit Up.

Donor:  ${n.donorLabel}
Amount: ${money(n.total)}

Items funded (item: qty × unit price = total):
${items}

Stripe session: ${n.sessionId}

— You're receiving this as the Kit Up / ASF admin.`;
  return sendAdminEmail(subject, text);
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
