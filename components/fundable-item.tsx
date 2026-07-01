"use client";

import { useState } from "react";
import { Minus, Plus, Check, ExternalLink, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { moneyExact, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ItemWithFunding } from "@/lib/types";
import { useCart } from "@/components/cart/cart-context";

/**
 * Who's looking, and whether they may fund:
 *   donor  - signed-in donor: can add to cart
 *   school - signed-in school: not allowed to fund
 *   anon   - signed out: prompt to sign in
 *   mock   - no Supabase (dev): cart works as a demo
 */
export type FundMode = "donor" | "school" | "anon" | "mock";

export function FundableItem({
  item,
  mode,
  campaignTitle,
}: {
  item: ItemWithFunding;
  mode: FundMode;
  campaignTitle: string;
}) {
  const { addLine, open } = useCart();
  const remaining = Math.max(0, item.quantity_needed - item.quantity_funded);
  const fullyFunded = remaining === 0;
  const [qty, setQty] = useState(remaining > 0 ? 1 : 0);

  const unit = item.product?.unit_price ?? item.cost;
  const lineTotal = unit * qty;
  const fundedPct = Math.round(
    (item.quantity_funded / item.quantity_needed) * 100,
  );

  function addToCart() {
    addLine({
      itemId: item.id,
      campaignId: item.campaign_id,
      campaignTitle,
      title: item.title,
      unitCost: unit,
      quantity: qty,
      maxQuantity: remaining,
    });
    open();
  }

  return (
    <li
      className={cn(
        "rounded-xl border border-line bg-surface p-5 transition-colors",
        fullyFunded && "bg-surface-sunk/60",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {item.category && <Badge tone="neutral">{item.category}</Badge>}
            {fullyFunded && (
              <Badge tone="turf">
                <Check className="h-3 w-3" aria-hidden /> Funded
              </Badge>
            )}
          </div>
          <h3 className="font-bold text-ink">{item.title}</h3>
          {item.description && (
            <p className="mt-1 text-sm text-ink-soft">{item.description}</p>
          )}
          {item.product && (
            <a
              href={item.product.product_url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-ink-faint hover:text-ink"
            >
              {item.product.name}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>

        <div className="text-right">
          <p className="font-display text-lg font-bold text-ink">
            {moneyExact(unit)}
          </p>
          <p className="text-xs text-ink-faint">each</p>
        </div>
      </div>

      {/* funded-of-needed line */}
      <div className="mt-4 flex items-center gap-3">
        <div className="lane h-1.5 flex-1">
          <div className="lane-fill" style={{ width: `${fundedPct}%` }} />
        </div>
        <span className="shrink-0 text-xs font-medium text-ink-soft tabular-nums">
          {item.quantity_funded}/{item.quantity_needed} funded
        </span>
      </div>

      {/* action row */}
      <div className="mt-4 border-t border-line pt-4">
        {fullyFunded ? (
          <p className="text-sm font-medium text-turf-dark">
            This one&apos;s sorted — thanks to the donors who chipped in.
          </p>
        ) : mode === "school" ? (
          <p className="text-sm text-ink-soft">
            Schools can&apos;t fund items — sign in with a donor account to chip
            in.
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center rounded-full border border-line-strong bg-surface">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label="Fund one fewer"
                className="grid h-9 w-9 place-items-center rounded-full text-ink transition-colors hover:bg-surface-sunk disabled:opacity-40"
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <span className="w-8 text-center text-sm font-bold tabular-nums">
                {qty}
              </span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(remaining, q + 1))}
                disabled={qty >= remaining}
                aria-label="Fund one more"
                className="grid h-9 w-9 place-items-center rounded-full text-ink transition-colors hover:bg-surface-sunk disabled:opacity-40"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <Button onClick={addToCart} size="sm">
              <ShoppingCart className="h-4 w-4" aria-hidden />
              Add · {money(lineTotal)}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
