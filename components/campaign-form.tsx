"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Plus,
  Minus,
  Trash2,
  Loader2,
  Info,
  Lock,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { money, moneyExact } from "@/lib/format";
import { boldIncludes } from "@/lib/bold-includes";
import { matchesCatalogue } from "@/lib/catalogue-search";
import { ProductImages } from "@/components/product-images";
import type { HartSportProduct } from "@/lib/types";
import { createCampaign } from "@/app/dashboard/campaigns/new/actions";
import { updateCampaign } from "@/app/dashboard/campaigns/[id]/edit/actions";
import { CoverImagePicker } from "@/components/cover-image-picker";
import {
  CAMPAIGN_IMPACT_READY,
  EMPTY_IMPACT,
  IMPACT_SELECTS,
  type ImpactValues,
} from "@/lib/campaign-fields";

export interface CampaignFormInitial {
  campaignId: string;
  title: string;
  description: string;
  deadline: string; // yyyy-mm-dd
  coverImage: string | null;
  items: {
    id: string;
    hart_product_id: string;
    productName: string;
    title: string;
    cost: number;
    quantity_needed: number;
    quantity_funded: number;
  }[];
  impact?: ImpactValues;
}

interface DraftItem {
  key: number;
  id?: string; // existing item id (edit mode)
  hart_product_id: string;
  productName: string;
  title: string;
  cost: number;
  quantity_needed: number;
  quantity_funded: number; // 0 for new / unfunded
}

export function CampaignForm({
  catalogue,
  disabled = false,
  notice,
  initial,
}: {
  catalogue: HartSportProduct[];
  disabled?: boolean;
  notice?: string;
  initial?: CampaignFormInitial;
}) {
  const isEdit = Boolean(initial);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [deadline, setDeadline] = useState(initial?.deadline ?? "");
  const [impact, setImpact] = useState<ImpactValues>({
    ...EMPTY_IMPACT,
    ...(initial?.impact ?? {}),
  });
  const [coverImage, setCoverImage] = useState<string | null>(
    initial?.coverImage ?? null,
  );
  const keyRef = useRef(0);
  const [items, setItems] = useState<DraftItem[]>(
    () =>
      initial?.items.map((it) => ({
        key: keyRef.current++,
        id: it.id,
        hart_product_id: it.hart_product_id,
        productName: it.productName,
        title: it.title,
        cost: it.cost,
        quantity_needed: it.quantity_needed,
        quantity_funded: it.quantity_funded,
      })) ?? [],
  );
  const [query, setQuery] = useState("");
  // Selected sport/activity (category) filter — "" = all. Plus a lightbox for
  // enlarging a product image.
  const [activity, setActivity] = useState("");
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null);

  const minDeadline = useMemo(() => {
    const d = new Date(Date.now() + 86_400_000);
    return d.toISOString().slice(0, 10);
  }, []);

  // All activities (categories), sorted, for the dropdown.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of catalogue) set.add(p.category ?? "Other");
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [catalogue]);

  // The most-stocked activities, for one-tap filter chips.
  const topActivities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of catalogue) {
      const c = p.category ?? "Other";
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([c]) => c);
  }, [catalogue]);

  // Filter by the chosen activity AND the search text. Search matches name,
  // category, SKU and description, with multi-word + synonym awareness so lay
  // terms like "gym equipment" surface weights (see lib/catalogue-search).
  const filtered = useMemo(() => {
    const q = query.trim();
    return catalogue.filter((p) => {
      if (activity && (p.category ?? "Other") !== activity) return false;
      if (
        q &&
        !matchesCatalogue(
          `${p.name} ${p.category ?? ""} ${p.hart_sku} ${p.description ?? ""}`,
          query,
        )
      )
        return false;
      return true;
    });
  }, [catalogue, query, activity]);

  const grouped = useMemo(() => {
    const map = new Map<string, HartSportProduct[]>();
    for (const p of filtered) {
      const cat = p.category ?? "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const fundingGoal = items.reduce(
    (sum, it) => sum + it.cost * it.quantity_needed,
    0,
  );

  function addProduct(product: HartSportProduct) {
    setItems((prev) => [
      ...prev,
      {
        key: keyRef.current++,
        hart_product_id: product.id,
        productName: product.name,
        title: product.name,
        cost: product.unit_price ?? 0,
        quantity_needed: 1,
        quantity_funded: 0,
      },
    ]);
  }

  function toggleProduct(product: HartSportProduct) {
    const existing = items.find((it) => it.hart_product_id === product.id);
    if (existing) {
      if (existing.quantity_funded > 0) return; // funded items are locked
      setItems((prev) =>
        prev.filter((it) => it.hart_product_id !== product.id),
      );
    } else {
      addProduct(product);
    }
  }

  // Step a product's quantity straight from the picker table. Dropping an
  // unfunded item below 1 removes it; a funded item can't go below what's funded.
  function stepQuantity(product: HartSportProduct, delta: number) {
    const it = items.find((i) => i.hart_product_id === product.id);
    if (!it) return;
    const minQty = Math.max(1, it.quantity_funded);
    const next = it.quantity_needed + delta;
    if (next < minQty) {
      if (it.quantity_funded === 0) {
        setItems((prev) =>
          prev.filter((i) => i.hart_product_id !== product.id),
        );
      }
      return;
    }
    updateItem(it.key, { quantity_needed: next });
  }

  function updateItem(key: number, patch: Partial<DraftItem>) {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    );
  }

  function removeItem(key: number) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (disabled) {
      setError(notice ?? "Saving needs Supabase connected.");
      return;
    }
    if (!title.trim()) return setError("Give your campaign a title.");
    if (!deadline) return setError("Pick a deadline.");
    if (items.length === 0)
      return setError("Add at least one item from the catalogue.");

    startTransition(async () => {
      const result = isEdit
        ? await updateCampaign({
            campaignId: initial!.campaignId,
            title,
            description,
            deadline,
            cover_image: coverImage,
            impact,
            items: items.map((it) => ({
              id: it.id,
              hart_product_id: it.hart_product_id,
              title: it.title,
              cost: it.cost,
              quantity_needed: it.quantity_needed,
            })),
          })
        : await createCampaign({
            title,
            description,
            deadline,
            cover_image: coverImage,
            impact,
            items: items.map((it) => ({
              hart_product_id: it.hart_product_id,
              title: it.title,
              cost: it.cost,
              quantity_needed: it.quantity_needed,
            })),
          });
      // On success the action redirects; only failures return here.
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  const labelCls = "mb-1.5 block text-sm font-semibold text-ink";
  const inputCls =
    "w-full rounded-lg border border-line-strong bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30";

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        // Pressing Enter in a single-line input would otherwise submit (and
        // save) the whole campaign — e.g. while searching the catalogue or
        // typing a quantity. Block it on inputs; the textarea (newlines) and the
        // explicit "Create/Save" button are unaffected, so the form is only
        // submitted deliberately.
        const el = e.target as HTMLElement;
        if (e.key === "Enter" && el.tagName === "INPUT") e.preventDefault();
      }}
      className="mt-8 space-y-8"
    >
      {(disabled || notice) && (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-sunk/60 p-4 text-sm text-ink-soft">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
          {notice ??
            "Connect Supabase to save — you can still explore the form."}
        </p>
      )}

      {/* ---- Campaign details ---- */}
      <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
        <h2 className="font-display text-lg font-bold text-ink">
          Campaign details
        </h2>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="title" className={labelCls}>
              Title
            </label>
            <input
              id="title"
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brunswick High School's Soccer Program"
              required
            />
          </div>
          <div>
            <label htmlFor="description" className={labelCls}>
              Description
            </label>
            <textarea
              id="description"
              className={`${inputCls} min-h-24 resize-y`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell donors what you need and why it matters."
            />
          </div>
          <div className="max-w-xs">
            <label htmlFor="deadline" className={labelCls}>
              Deadline
            </label>
            <input
              id="deadline"
              type="date"
              className={inputCls}
              value={deadline}
              min={minDeadline}
              onChange={(e) => setDeadline(e.target.value)}
              required
            />
          </div>
          <CoverImagePicker value={coverImage} onChange={setCoverImage} />
        </div>
      </section>

      {CAMPAIGN_IMPACT_READY && (
        <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
          <h2 className="font-display text-lg font-bold text-ink">
            The need &amp; impact
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Optional — this helps the Australian Sports Foundation understand the
            need behind your campaign. Shared with ASF; not shown publicly.
          </p>
          <div className="mt-4 space-y-4">
            <div className="max-w-xs">
              <label htmlFor="students_reached" className={labelCls}>
                How many students will this reach?
              </label>
              <input
                id="students_reached"
                type="number"
                min={0}
                className={inputCls}
                value={impact.students_reached ?? ""}
                onChange={(e) =>
                  setImpact((v) => ({
                    ...v,
                    students_reached: e.target.value
                      ? Math.max(0, Math.floor(Number(e.target.value)))
                      : null,
                  }))
                }
                placeholder="e.g. 120"
              />
            </div>
            {IMPACT_SELECTS.map((f) => {
              const options = f.options as readonly string[];
              const hasOther = options.includes("Other");
              const current = impact[f.key];
              // A stored value that isn't a preset option is a custom "Other"
              // answer — show the select on "Other" and prefill the text box.
              const isCustom =
                hasOther && current !== "" && !options.includes(current);
              const showOther =
                hasOther && (current === "Other" || isCustom);
              return (
                <div key={f.key}>
                  <label htmlFor={f.key} className={labelCls}>
                    {f.label}
                  </label>
                  <select
                    id={f.key}
                    className={inputCls}
                    value={isCustom ? "Other" : current}
                    onChange={(e) =>
                      setImpact((v) => ({ ...v, [f.key]: e.target.value }))
                    }
                  >
                    <option value="">Select…</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  {showOther && (
                    <input
                      type="text"
                      className={`${inputCls} mt-2`}
                      // "Other" sentinel means picked-but-not-typed → empty box.
                      value={isCustom ? current : ""}
                      onChange={(e) =>
                        setImpact((v) => ({
                          ...v,
                          [f.key]: e.target.value || "Other",
                        }))
                      }
                      placeholder="Please specify"
                      aria-label={`${f.label} — please specify`}
                      maxLength={200}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ---- Items from the catalogue ---- */}
      <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
        <h2 className="font-display text-lg font-bold text-ink">
          What you need
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Add kit from the Hart Sport catalogue. Each item is something donors
          can fund.
        </p>

        {catalogue.length > 0 && (
          <div className="mt-4 space-y-3">
            {/* Quick activity chips */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setActivity("")}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  activity === ""
                    ? "border-coral bg-coral/10 text-coral-dark"
                    : "border-line-strong text-ink-soft hover:bg-surface-sunk",
                )}
              >
                All activities
              </button>
              {topActivities.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActivity(activity === c ? "" : c)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                    activity === c
                      ? "border-coral bg-coral/10 text-coral-dark"
                      : "border-line-strong text-ink-soft hover:bg-surface-sunk",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Full activity dropdown + search */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="catalogue-activity">
                Filter by sport or activity
              </label>
              <select
                id="catalogue-activity"
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                className={`${inputCls} sm:max-w-[15rem]`}
              >
                <option value="">All activities ({catalogue.length})</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div className="relative flex-1">
                <label className="sr-only" htmlFor="catalogue-search">
                  Search the catalogue
                </label>
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                  aria-hidden
                />
                <input
                  id="catalogue-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Try “gym equipment”, “netball”, “cones”…"
                  className={`${inputCls} pl-10`}
                />
              </div>
            </div>

            {(query.trim() || activity) && (
              <p className="text-xs text-ink-faint">
                {filtered.length} product{filtered.length === 1 ? "" : "s"}
                {activity && (
                  <>
                    {" "}
                    in{" "}
                    <span className="font-semibold text-ink-soft">
                      {activity}
                    </span>
                  </>
                )}
                {query.trim() && <> matching “{query.trim()}”</>}
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setActivity("");
                  }}
                  className="ml-2 font-semibold text-coral hover:text-coral-dark"
                >
                  Clear
                </button>
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          {catalogue.length === 0 ? (
            <p className="rounded-xl border border-line p-4 text-sm text-ink-soft">
              Catalogue is empty — import products first.
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-xl border border-line p-4 text-sm text-ink-soft">
              No products match — try a different activity or search.
            </p>
          ) : (
            <div className="max-h-[42rem] space-y-6 overflow-y-auto rounded-xl border border-line p-3">
              {grouped.map(([cat, products]) => (
                <div key={cat}>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">
                    {cat}
                  </h4>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {products.map((p) => {
                      const item = items.find(
                        (it) => it.hart_product_id === p.id,
                      );
                      const selected = Boolean(item);
                      const qty = item?.quantity_needed ?? 0;
                      const funded = item?.quantity_funded ?? 0;
                      const minQty = Math.max(1, funded);
                      const locked = funded > 0;
                      return (
                        <div
                          key={p.id}
                          className={cn(
                            "flex flex-col rounded-xl border p-2.5 transition-colors",
                            selected
                              ? "border-turf/60 bg-turf/5"
                              : "border-line bg-surface hover:border-line-strong",
                          )}
                        >
                          <ProductImages
                            images={[p.image_url, p.image_url_2].filter(
                              (u): u is string => Boolean(u),
                            )}
                            name={p.name}
                            onZoom={(url) => setZoom({ url, name: p.name })}
                          />
                          <p className="line-clamp-2 text-sm font-medium leading-snug text-ink">
                            {p.name}
                          </p>
                          <p className="mt-0.5 text-sm font-bold tabular-nums text-ink">
                            {p.unit_price != null
                              ? moneyExact(p.unit_price)
                              : "—"}
                          </p>
                          {p.description && (
                            <p
                              title={p.description}
                              className="mt-1 line-clamp-2 cursor-help text-xs leading-relaxed text-ink-faint hover:line-clamp-none"
                            >
                              {boldIncludes(p.description)}
                            </p>
                          )}
                          <div className="mt-auto pt-2.5">
                            {selected ? (
                              <div className="flex items-center justify-between gap-2">
                                <div className="inline-flex items-center rounded-full border border-turf/60 bg-turf/5">
                                  <button
                                    type="button"
                                    aria-label={
                                      !locked && qty <= minQty
                                        ? "Remove item"
                                        : "Decrease quantity"
                                    }
                                    onClick={() => stepQuantity(p, -1)}
                                    disabled={locked && qty <= minQty}
                                    title={
                                      locked && qty <= minQty
                                        ? `${funded} already funded`
                                        : undefined
                                    }
                                    className="grid h-8 w-8 place-items-center rounded-full text-turf-dark hover:bg-turf/15 disabled:opacity-40"
                                  >
                                    {!locked && qty <= minQty ? (
                                      <Trash2
                                        className="h-3.5 w-3.5"
                                        aria-hidden
                                      />
                                    ) : (
                                      <Minus
                                        className="h-3.5 w-3.5"
                                        aria-hidden
                                      />
                                    )}
                                  </button>
                                  <span className="w-7 text-center text-sm font-bold tabular-nums text-turf-dark">
                                    {qty}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label="Increase quantity"
                                    onClick={() => stepQuantity(p, 1)}
                                    className="grid h-8 w-8 place-items-center rounded-full text-turf-dark hover:bg-turf/15"
                                  >
                                    <Plus className="h-3.5 w-3.5" aria-hidden />
                                  </button>
                                </div>
                                {locked && (
                                  <Lock
                                    className="h-3.5 w-3.5 shrink-0 text-turf-dark"
                                    aria-label={`${funded} funded`}
                                  />
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggleProduct(p)}
                                className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-coral bg-coral/10 px-3 py-1.5 text-xs font-semibold text-coral-dark transition-colors hover:bg-coral/20"
                              >
                                <Plus className="h-3.5 w-3.5" aria-hidden />
                                Add
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {zoom && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={zoom.name}
            onClick={() => setZoom(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          >
            <div
              className="relative max-w-lg rounded-xl bg-white p-3"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setZoom(null)}
                aria-label="Close image"
                className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <div className="relative aspect-square w-[80vw] max-w-md">
                <Image
                  src={zoom.url}
                  alt={zoom.name}
                  fill
                  sizes="80vw"
                  className="object-contain"
                />
              </div>
              <p className="mt-2 text-center text-sm font-medium text-ink">
                {zoom.name}
              </p>
            </div>
          </div>
        )}
        {items.length > 0 && (
          <p className="mt-3 text-sm font-medium text-ink-soft">
            {items.length} item{items.length === 1 ? "" : "s"} selected — set
            quantities and labels below.
          </p>
        )}

        {items.length > 0 && (
          <ul className="mt-6 space-y-3">
            {items.map((it) => {
              const locked = it.quantity_funded > 0;
              const minQty = Math.max(1, it.quantity_funded);
              return (
                <li
                  key={it.key}
                  className="rounded-xl border border-line bg-canvas p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-medium text-ink-faint">
                      {it.productName}
                      {locked && (
                        <span className="ml-2 inline-flex items-center gap-1 text-turf-dark">
                          <Lock className="h-3 w-3" aria-hidden />
                          {it.quantity_funded} funded
                        </span>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeItem(it.key)}
                      aria-label="Remove item"
                      disabled={locked}
                      title={
                        locked ? "Funded items can't be removed" : undefined
                      }
                      className="text-ink-faint transition-colors hover:text-coral disabled:opacity-30 disabled:hover:text-ink-faint"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>

                  <div className="mt-2">
                    <label htmlFor={`title-${it.key}`} className="sr-only">
                      Item label
                    </label>
                    <input
                      id={`title-${it.key}`}
                      className={inputCls}
                      value={it.title}
                      onChange={(e) =>
                        updateItem(it.key, { title: e.target.value })
                      }
                      placeholder="What donors will see"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-end gap-4">
                    <div>
                      <span className={labelCls}>Quantity</span>
                      <div className="inline-flex items-center rounded-full border border-line-strong bg-surface">
                        <button
                          type="button"
                          aria-label="One fewer"
                          onClick={() =>
                            updateItem(it.key, {
                              quantity_needed: Math.max(
                                minQty,
                                it.quantity_needed - 1,
                              ),
                            })
                          }
                          disabled={it.quantity_needed <= minQty}
                          className="grid h-9 w-9 place-items-center rounded-full text-ink hover:bg-surface-sunk disabled:opacity-40"
                        >
                          <Minus className="h-4 w-4" aria-hidden />
                        </button>
                        <span className="w-8 text-center text-sm font-bold tabular-nums">
                          {it.quantity_needed}
                        </span>
                        <button
                          type="button"
                          aria-label="One more"
                          onClick={() =>
                            updateItem(it.key, {
                              quantity_needed: it.quantity_needed + 1,
                            })
                          }
                          className="grid h-9 w-9 place-items-center rounded-full text-ink hover:bg-surface-sunk"
                        >
                          <Plus className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </div>

                    <div className="w-28">
                      <label htmlFor={`cost-${it.key}`} className={labelCls}>
                        Cost each
                      </label>
                      <input
                        id={`cost-${it.key}`}
                        type="number"
                        min={0}
                        step="0.01"
                        className={inputCls}
                        value={it.cost}
                        onChange={(e) =>
                          updateItem(it.key, {
                            cost: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </div>

                    <p className="ml-auto text-sm font-semibold text-ink tabular-nums">
                      {moneyExact(it.cost * it.quantity_needed)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- Summary + submit ---- */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-6 shadow-card">
        <div>
          <p className="text-sm text-ink-soft">Funding goal (sum of items)</p>
          <p className="font-display text-2xl font-bold text-ink tabular-nums">
            {money(fundingGoal)}
          </p>
        </div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {pending
            ? "Saving…"
            : isEdit
              ? "Save changes"
              : "Create campaign"}
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-coral/10 px-3 py-2 text-sm font-medium text-coral-dark"
        >
          {error}
        </p>
      )}
    </form>
  );
}
