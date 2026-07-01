#!/usr/bin/env python3
"""
Load a Hart Sport product CSV into Supabase (public.hart_sport_products).

Setup:
    pip install supabase
    export SUPABASE_URL="https://<your-project>.supabase.co"
    export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # bypasses RLS

Usage:
    python import_catalogue.py hart_sport_products_template.csv

Notes:
    * Upserts on hart_sku, so re-running updates prices/names rather than
      creating duplicates. Run it on a schedule to keep the catalogue fresh.
    * Rows whose hart_sku starts with EXAMPLE_ are skipped, so the template's
      placeholder rows won't be imported. Replace them with real data first.
    * Use the SERVICE ROLE key (server-side only — never ship it to the
      browser); the catalogue table is read-only to normal users via RLS.
"""

import csv
import os
import sys

from supabase import create_client


def load(csv_path: str) -> None:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sb = create_client(url, key)

    rows = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            sku = (r.get("hart_sku") or "").strip()
            if not sku or sku.startswith("EXAMPLE_"):
                continue  # skip blanks and template placeholders

            price = (r.get("unit_price") or "").strip()
            rows.append({
                "hart_sku": sku,
                "name": (r.get("name") or "").strip(),
                "category": (r.get("category") or "").strip() or None,
                "unit_price": float(price) if price else None,
                "product_url": (r.get("product_url") or "").strip() or None,
            })

    if not rows:
        print("No real rows to import (only placeholders found).")
        return

    sb.table("hart_sport_products").upsert(rows, on_conflict="hart_sku").execute()
    print(f"Upserted {len(rows)} products into hart_sport_products.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python import_catalogue.py <catalogue.csv>")
    load(sys.argv[1])
