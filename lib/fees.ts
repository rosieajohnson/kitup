/**
 * Checkout "Help cover our fundraising costs" fee. Added at checkout only, and
 * donors can opt out. Shared by the cart UI (client) and the Stripe checkout
 * action (server) so the displayed and charged amounts always match.
 *
 * >>> To change the fee, edit these two rates. <<<
 * The total fee is simply their sum (currently 3.35% + 1.55% = 4.90%).
 */
export const FEE_RATES = {
  platformCosts: 0.0335, // Kit Up platform costs
  processing: 0.0155, // payment processing fees
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Format a rate as a percent string, e.g. 0.0335 -> "3.35%". */
export function feePct(rate: number): string {
  return `${+(rate * 100).toFixed(2)}%`;
}

export interface FeeBreakdown {
  platformCosts: number;
  processing: number;
  total: number;
}

/** Dollar breakdown of the fee for a given donation amount. */
export function computeFees(donation: number): FeeBreakdown {
  const platformCosts = round2(donation * FEE_RATES.platformCosts);
  const processing = round2(donation * FEE_RATES.processing);
  // Total is the sum of the rounded parts so the breakdown always adds up.
  return { platformCosts, processing, total: round2(platformCosts + processing) };
}

/** Labels + descriptions for the expandable breakdown. `schoolLabel` names the
 *  campaign's school (or a generic phrase for multi-school carts). */
export function feeCopy(schoolLabel: string) {
  return {
    platformCosts: {
      label: "Platform costs",
      rate: FEE_RATES.platformCosts,
      description: `A small percentage of each donation is used by Kit Up to help cover the costs of running a fundraising platform and providing support to fundraisers like ${schoolLabel}.`,
    },
    processing: {
      label: "Payment processing fees",
      rate: FEE_RATES.processing,
      description: `Payment processing fees are charged by online payment providers. The fee on this donation is ${feePct(FEE_RATES.processing)}.`,
    },
  };
}
