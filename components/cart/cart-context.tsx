"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface CartLine {
  itemId: string;
  campaignId: string;
  campaignTitle: string;
  /** Owning school's name — used in the checkout fee breakdown copy. */
  schoolName?: string;
  title: string;
  unitCost: number;
  quantity: number;
  /** How many of this item the campaign still needs (the cap). */
  maxQuantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  count: number; // total quantity across lines
  total: number; // dollar total
  isOpen: boolean;
  checkoutEnabled: boolean;
  signedInDonor: boolean;
  open: () => void;
  close: () => void;
  addLine: (line: CartLine) => void;
  setQuantity: (itemId: string, quantity: number) => void;
  removeLine: (itemId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "kitup_cart_v1";

export function CartProvider({
  children,
  checkoutEnabled,
  signedInDonor,
}: {
  children: React.ReactNode;
  checkoutEnabled: boolean;
  signedInDonor: boolean;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load once on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setLines(JSON.parse(raw) as CartLine[]);
    } catch {
      // ignore malformed storage
    }
    setHydrated(true);
  }, []);

  // Persist after hydration.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // ignore quota / unavailable storage
    }
  }, [lines, hydrated]);

  const addLine = useCallback((line: CartLine) => {
    const cap = line.maxQuantity > 0 ? line.maxQuantity : line.quantity;
    setLines((prev) => {
      const existing = prev.find((l) => l.itemId === line.itemId);
      if (existing) {
        return prev.map((l) =>
          l.itemId === line.itemId
            ? {
                ...l,
                // Never exceed what the campaign still needs.
                quantity: Math.min(l.quantity + line.quantity, cap),
                maxQuantity: line.maxQuantity,
              }
            : l,
        );
      }
      return [...prev, { ...line, quantity: Math.min(line.quantity, cap) }];
    });
  }, []);

  const setQuantity = useCallback((itemId: string, quantity: number) => {
    setLines((prev) =>
      prev
        .map((l) => {
          if (l.itemId !== itemId) return l;
          const cap = l.maxQuantity > 0 ? l.maxQuantity : quantity;
          return { ...l, quantity: Math.min(Math.max(1, quantity), cap) };
        })
        .filter((l) => l.quantity > 0),
    );
  }, []);

  const removeLine = useCallback((itemId: string) => {
    setLines((prev) => prev.filter((l) => l.itemId !== itemId));
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    // Also wipe storage so the mount-time reload can't repopulate it
    // (the reload effect runs after a child's clear() on the success page).
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const count = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity, 0),
    [lines],
  );
  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.unitCost * l.quantity, 0),
    [lines],
  );

  const value: CartContextValue = {
    lines,
    count,
    total,
    isOpen,
    checkoutEnabled,
    signedInDonor,
    open,
    close,
    addLine,
    setQuantity,
    removeLine,
    clear,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
