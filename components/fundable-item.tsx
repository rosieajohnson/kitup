"use client";

import { useState } from "react";
import Image from "next/image";
import { Minus, Plus, Check, ExternalLink, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { moneyExact, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ItemWithFunding } from "@/lib/types";
import { useCart } from "@/components/cart/cart-context";
import {
  PARTIAL_FUNDING_READY,
  MIN_CONTRIBUTION,
  itemTotalCost,
  itemRemainingCost,
} from "@/lib/funding";

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
  schoolName,
  closed = false,
}: {
  item: ItemWithFunding;
  mode: FundMode;
  campaignTitle: string;
  schoolName?: string;
  closed?: boolean;
}) {
  const { addLine, open } = useCart();
  const unit = item.product?.unit_price ?? item.cost;

  // ---- Whole-unit funding (current model) ----
  const remaining = Math.max(0, item.quantity_needed - item.quantity_funded);
  const [qty, setQty] = useState(remaining > 0 ? 1 : 0);
  const lineTotal = unit * qty;

  // ---- Per-dollar funding (PARTIAL_FUNDING_READY) ----
  const totalCost = itemTotalCost(item);
  const raised = Number(item.amount_raised ?? 0);
  const remainingCost = itemRemainingCost(item);
  const [amount, setAmount] = useState(() =>
    Math.max(MIN_CONTRIBUTION, Math.round(remainingCost * 100) / 100),
  );

  const fullyFunded = PARTIAL_FUNDING_READY
    ? remainingCost <= 0
    : remaining === 0;
  const fundedPct = PARTIAL_FUNDING_READY
    ? totalCost > 0
      ? Math.min(100, Math.round((raised / totalCost) * 100))
      : 0
    : Math.round((item.quantity_funded / item.quantity_needed) * 100);

  function addToCart() {
    if (PARTIAL_FUNDING_READY) {
      const amt = Math.min(
        Math.max(MIN_CONTRIBUTION, amount || 0),
        remainingCost,
      );
      if (amt < MIN_CONTRIBUTION) return;
      addLine({
        itemId: item.id,
        campaignId: item.campaign_id,
        campaignTitle,
        schoolName,
        title: item.title,
        unitCost: unit,
        quantity: 1,
        maxQuantity: 0,
        amount: Math.round(amt * 100) / 100,
        maxAmount: remainingCost,
      });
    } else {
      addLine({
        itemId: item.id,
        campaignId: item.campaign_id,
        campaignTitle,
        schoolName,
        title: item.title,
        unitCost: unit,
        quantity: qty,
        maxQuantity: remaining,
      });
    }
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
        <div className="flex min-w-0 flex-1 items-start gap-4">
        {item.product?.image_url && (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-line bg-white">
            <Image
              src={item.product.image_url}
              alt={item.product.name}
              fill
              sizes="80px"
              className="object-contain p-1"
            />
          </div>
        )}
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
        </div>

        <div className="text-right">
          <p className="font-display text-lg font-bold text-ink">
            {moneyExact(unit)}
          </p>
          <p className="text-xs text-ink-faint">each</p>
        </div>
      </div>

      {/* funded progress line */}
      <div className="mt-4 flex items-center gap-3">
        <div className="lane h-1.5 flex-1">
          <div className="lane-fill" style={{ width: `${fundedPct}%` }} />
        </div>
        <span className="shrink-0 text-xs font-medium text-ink-soft tabular-nums">
          {PARTIAL_FUNDING_READY
            ? `${moneyExact(raised)} of ${moneyExact(totalCost)}`
            : `${item.quantity_funded}/${item.quantity_needed} funded`}
        </span>
      </div>

      {/* action row */}
      <div className="mt-4 border-t border-line pt-4">
        {closed && !fullyFunded ? (
          <p className="text-sm text-ink-soft">
            This campaign has closed — funding is no longer available.
          </p>
        ) : fullyFunded ? (
          <p className="text-sm font-medium text-turf-dark">
            This one&apos;s sorted — thanks to the donors who chipped in.
          </p>
        ) : mode === "school" ? (
          <p className="text-sm text-ink-soft">
            Schools can&apos;t fund items — sign in with a donor account to chip
            in.
          </p>
        ) : PARTIAL_FUNDING_READY ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
              <span>Contribute</span>
              <span className="inline-flex items-center rounded-full border border-line-strong bg-surface px-3 py-1.5">
                <span className="text-ink-faint">$</span>
                <input
                  type="number"
                  min={MIN_CONTRIBUTION}
                  max={remainingCost}
                  step="1"
                  value={amount}
                  onChange={(e) =>
                    setAmount(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="w-20 bg-transparent text-right text-sm font-bold tabular-nums text-ink focus:outline-none"
                  aria-label={`Contribution to ${item.title}`}
                />
              </span>
            </label>

            <Button
              onClick={addToCart}
              size="sm"
              disabled={amount < MIN_CONTRIBUTION || amount > remainingCost}
            >
              <ShoppingCart className="h-4 w-4" aria-hidden />
              Add · {money(Math.min(Math.max(amount, 0), remainingCost))}
            </Button>
          </div>
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
