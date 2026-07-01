"use client";

import { useEffect } from "react";
import { useCart } from "@/components/cart/cart-context";

/** Empties the cart on mount — rendered on the post-payment page. */
export function ClearCart() {
  const { clear } = useCart();
  useEffect(() => {
    clear();
  }, [clear]);
  return null;
}
