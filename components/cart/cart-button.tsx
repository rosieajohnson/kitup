"use client";

import { ShoppingCart } from "lucide-react";
import { useCart } from "@/components/cart/cart-context";

export function CartButton() {
  const { count, open } = useCart();

  return (
    <button
      type="button"
      onClick={open}
      aria-label={`Open cart (${count} item${count === 1 ? "" : "s"})`}
      className="relative grid h-9 w-9 place-items-center rounded-full text-ink transition-colors hover:bg-surface-sunk"
    >
      <ShoppingCart className="h-5 w-5" aria-hidden />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-coral px-1 text-[10px] font-bold leading-none text-white">
          {count}
        </span>
      )}
    </button>
  );
}
