"use client";

import { CheckCircle2 } from "lucide-react";

import { PumpShiftDeleteDialog } from "@/components/finance/pump-shift-delete-dialog";
import type { PumpShiftRecord, ShiftRecord } from "@/server/domain/operations";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function TodaySavedPumpShifts({
  entries,
  shiftId,
  today,
  onDeleted
}: {
  entries: PumpShiftRecord[];
  shiftId: string;
  today: string;
  onDeleted: (shift: ShiftRecord, deletedEntry: PumpShiftRecord) => void;
}) {
  const currentEntries = entries.filter((entry) => entry.businessDate === today);
  if (!currentEntries.length) return null;

  return <section aria-label="Saved entries for today" className="today-saved-entries">
    <header><span><CheckCircle2 size={18} /><span><strong>Saved entries for today</strong><small>Review accidental entries before closing the day.</small></span></span><small>Deleting here also removes it from today&apos;s Finance view.</small></header>
    <div className="today-saved-entry-list">{currentEntries.map((entry) => <article key={entry.id}>
      <span><strong>{entry.staffName}</strong><small>{entry.pumpLabel}{entry.shiftStartTime && entry.shiftEndTime ? ` · ${entry.shiftStartTime}–${entry.shiftEndTime}` : ""}</small></span>
      <span className="today-saved-entry-total"><strong>{entry.litresSold} L</strong><small>{money.format(Number(entry.expectedSalesValue))}</small></span>
      <PumpShiftDeleteDialog entry={{ ...entry, shiftId }} onDeleted={(shift) => onDeleted(shift, entry)} />
    </article>)}</div>
  </section>;
}
