"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReportRow } from "@/lib/types";

function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function DownloadReportButton({
  rows,
  filename,
}: {
  rows: ReportRow[];
  filename: string;
}) {
  function download() {
    const header = [
      "Campaign",
      "School",
      "Donor",
      "Item",
      "Quantity",
      "Amount (AUD)",
      "Date",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          csvCell(r.campaign_title),
          csvCell(r.school_name),
          csvCell(r.donor_name),
          csvCell(r.item_title),
          csvCell(r.quantity),
          csvCell(Number(r.amount).toFixed(2)),
          csvCell(new Date(r.donated_at).toISOString().slice(0, 10)),
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Button onClick={download} disabled={rows.length === 0} size="sm">
      <Download className="h-4 w-4" aria-hidden /> Download CSV
    </Button>
  );
}
