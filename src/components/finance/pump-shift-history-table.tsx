"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PumpShiftCorrectionDialog } from "@/components/finance/pump-shift-correction-dialog";
import { PumpShiftDeleteDialog } from "@/components/finance/pump-shift-delete-dialog";
import type { FinancePumpShiftEntry } from "@/server/services/finance-analytics-service";

type StaffOption = { id: string; name: string };

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const formatMoney = (value: string) => money.format(Number(value));

// Mirrors the server rule in applyPumpShiftEntryVoid: only today's entries on the open day can be deleted.
function deleteBlockedReason(entry: FinancePumpShiftEntry, today: string) {
  if (entry.shiftState !== "OPEN") return "Closed days cannot be changed";
  if (entry.businessDate !== today) return "Only today's entries can be deleted";
  return undefined;
}

export function PumpShiftHistoryTable({
  pumpShifts,
  stationLabels,
  staff,
  today,
  showDate = true
}: {
  pumpShifts: FinancePumpShiftEntry[];
  stationLabels: Record<string, string>;
  staff: StaffOption[];
  today: string;
  showDate?: boolean;
}) {
  const [editingEntry, setEditingEntry] = useState<FinancePumpShiftEntry | null>(null);

  return (
    <>
      <table className="data-table">
        <thead>
          <tr>
            {showDate ? <th>Date</th> : null}
            <th>Pump</th><th>Employee</th><th>Shift</th><th>Litres</th><th>Overall sales</th><th>Collections entered</th><th>Variance</th><th></th>
          </tr>
        </thead>
        <tbody>
          {pumpShifts.map((entry) => (
            <tr key={entry.id}>
              {showDate ? <td><Link className="table-title" href={`/finance/day/${entry.businessDate}`}>{entry.businessDate}</Link></td> : null}
              <td>{entry.pumpLabel}</td>
              <td>{entry.staffName}</td>
              <td>{entry.shiftStartTime && entry.shiftEndTime ? `${entry.shiftStartTime}–${entry.shiftEndTime}` : "—"}</td>
              <td className="mono">{entry.litresSold} L</td>
              <td className="mono">{formatMoney(entry.expectedSalesValue)}</td>
              <td className="mono">{formatMoney(entry.accountedTender)}</td>
              <td className={`mono ${Number(entry.tenderVariance) < 0 ? "loss-value" : "profit-value"}`}>{formatMoney(entry.tenderVariance)}</td>
              <td><span className="pump-shift-row-actions">{entry.shiftState === "OPEN" ? <button aria-label={`Correct ${entry.staffName}'s ${entry.pumpLabel} entry`} className="button ghost" onClick={() => setEditingEntry(entry)} type="button"><Pencil size={14} /></button> : null}<PumpShiftDeleteDialog disabledReason={deleteBlockedReason(entry, today)} entry={entry} /></span></td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingEntry ? (
        <PumpShiftCorrectionDialog entry={editingEntry} onClose={() => setEditingEntry(null)} staff={staff} stationLabels={stationLabels} />
      ) : null}
    </>
  );
}
