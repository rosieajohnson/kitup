/**
 * Checkout "Help cover our fundraising costs" fee. Added at checkout only, and
 * donors can opt out. Shared by the cart UI (client) and the Stripe checkout
 * action (server) so the displayed and charged amounts always match.
 *
 * >>> To change the fee, edit this rate. <<<
 * A single blanket platform-costs fee (currently 5%).
 */
export const FEE_RATES = {
  platformCosts: 0.05, // blanket Kit Up platform costs
} as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Format a rate as a percent string, e.g. 0.05 -> "5%". */
export function feePct(rate: number): string {
  return `${+(rate * 100).toFixed(2)}%`;
}

export interface FeeBreakdown {
  platformCosts: number;
  total: number;
}

/** Dollar breakdown of the fee for a given donation amount. */
export function computeFees(donation: number): FeeBreakdown {
  const platformCosts = round2(donation * FEE_RATES.platformCosts);
  return { platformCosts, total: platformCosts };
}

/** Labels + description for the fee. `schoolLabel` names the campaign's school
 *  (or a generic phrase for multi-school carts). */
export function feeCopy(schoolLabel: string) {
  return {
    platformCosts: {
      label: "Platform costs",
      rate: FEE_RATES.platformCosts,
      description: `A flat ${feePct(FEE_RATES.platformCosts)} of each donation is used by Kit Up to help cover the costs of running a fundraising platform and providing support to fundraisers like ${schoolLabel}.`,
    },
  };
}
