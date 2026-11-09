import type { ItemWithFunding } from "@/lib/types";

/**
 * Per-dollar partial funding: donors contribute any dollar amount toward an
 * item (not whole units). At campaign close, items fully funded are purchased
 * & shipped; the dollars contributed to items that fell short are wrapped into a
 * single Hart Sport gift card for the school (no refunds — the shortfall is just
 * unraised, not money anyone holds).
 *
 * Gated OFF until the whole flow is ready (funding UI + close/gift-card
 * reconciliation + policy wording). While off, funding stays whole-unit.
 */
export const PARTIAL_FUNDING_READY = true;

/** Minimum contribution (AUD) — tax-deductibility floor. */
export const MIN_CONTRIBUTION = 2;

/** An item's full cost = unit price × quantity needed. */
export function itemTotalCost(item: {
  cost: number;
  quantity_needed: number;
  product?: { unit_price: number | null } | null;
}): number {
  const unit = item.product?.unit_price ?? item.cost;
  return Math.round(unit * item.quantity_needed * 100) / 100;
}

/** Dollars still needed to fully fund an item (never below 0). */
export function itemRemainingCost(item: ItemWithFunding): number {
  const left = itemTotalCost(item) - Number(item.amount_raised ?? 0);
  return Math.max(0, Math.round(left * 100) / 100);
}
