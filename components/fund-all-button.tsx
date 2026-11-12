"use client";

import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { useCart } from "@/components/cart/cart-context";
import {
  PARTIAL_FUNDING_READY,
  MIN_CONTRIBUTION,
  itemRemainingCost,
} from "@/lib/funding";
import type { ItemWithFunding } from "@/lib/types";

/**
 * One-click "fund the whole campaign": adds every item that still needs funding
 * to the cart — its full remaining amount (per-dollar mode) or remaining
 * quantity (whole-unit mode) — then opens the cart. Hidden when nothing is left
 * to fund. Only shown to donors (not the owning school) on an open campaign.
 */
export function FundAllButton({
  items,
  campaignTitle,
  schoolName,
}: {
  items: ItemWithFunding[];
  campaignTitle: string;
  schoolName: string;
}) {
  const { addLine, open } = useCart();

  // Work out what's still fundable for each item.
  const fundable = items
    .map((item) => {
      if (PARTIAL_FUNDING_READY) {
        return { item, amount: itemRemainingCost(item), qty: 0 };
      }
      const qty = Math.max(0, item.quantity_needed - item.quantity_funded);
      return { item, amount: 0, qty };
    })
    .filter((f) =>
      PARTIAL_FUNDING_READY ? f.amount >= MIN_CONTRIBUTION : f.qty > 0,
    );

  if (fundable.length === 0) return null;

  const totalRemaining = PARTIAL_FUNDING_READY
    ? fundable.reduce((s, f) => s + f.amount, 0)
    : fundable.reduce(
        (s, f) => s + (f.item.product?.unit_price ?? f.item.cost) * f.qty,
        0,
      );

  function fundAll() {
    for (const f of fundable) {
      const item = f.item;
      const unit = item.product?.unit_price ?? item.cost;
      if (PARTIAL_FUNDING_READY) {
        addLine({
          itemId: item.id,
          campaignId: item.campaign_id,
          campaignTitle,
          schoolName,
          title: item.title,
          unitCost: unit,
          quantity: 1,
          maxQuantity: 0,
          amount: Math.round(f.amount * 100) / 100,
          maxAmount: f.amount,
        });
      } else {
        addLine({
          itemId: item.id,
          campaignId: item.campaign_id,
          campaignTitle,
          schoolName,
          title: item.title,
          unitCost: unit,
          quantity: f.qty,
          maxQuantity: f.qty,
        });
      }
    }
    open();
  }

  return (
    <Button size="sm" onClick={fundAll}>
      <ShoppingCart className="h-4 w-4" aria-hidden />
      Fund everything · {money(Math.round(totalRemaining))}
    </Button>
  );
}
