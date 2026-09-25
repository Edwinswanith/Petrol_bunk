"use client";

import { AlertTriangle, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { ShiftRecord } from "@/server/domain/operations";

export type DeletablePumpShiftEntry = {
  id: string;
  shiftId: string;
  pumpId: string;
  pumpLabel: string;
  staffName: string;
  businessDate: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  litresSold: string;
  expectedSalesValue: string;
};

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function PumpShiftDeleteDialog({ entry, onDeleted, disabledReason }: { entry: DeletablePumpShiftEntry; onDeleted?: (shift: ShiftRecord) => void; disabledReason?: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (open) dialogRef.current?.showModal(); }, [open]);

  function close() {
    dialogRef.current?.close();
    setOpen(false); setReason(""); setError("");
  }

  async function confirmDelete() {
    if (reason.trim().length < 2) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/shifts/${entry.shiftId}/pumps/${entry.pumpId}/history/${entry.id}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason.trim() })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not delete the entry");
      onDeleted?.(body as ShiftRecord);
      close();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the entry");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <button aria-label={`Delete ${entry.staffName}'s ${entry.pumpLabel} entry`} className="button ghost danger" disabled={Boolean(disabledReason)} onClick={() => setOpen(true)} title={disabledReason} type="button"><Trash2 size={14} /></button>
    {open ? <dialog className="pump-correction-dialog pump-delete-dialog" onClose={close} ref={dialogRef}>
      <header className="dialog-header">
        <div><p className="panel-kicker">Today only · open shift</p><h2 className="panel-title">Delete today’s entry?</h2></div>
        <button aria-label="Close" className="button ghost" disabled={saving} onClick={close} type="button"><X size={16} /></button>
      </header>
      <div className="delete-entry-warning"><AlertTriangle size={21} /><div><strong>{entry.staffName} · {entry.pumpLabel}</strong><span>{entry.shiftStartTime && entry.shiftEndTime ? `${entry.shiftStartTime}–${entry.shiftEndTime} · ` : ""}{entry.litresSold} L · {money.format(Number(entry.expectedSalesValue))}</span><small>This removes the entry from today’s totals and Finance view. Previous business dates will not change.</small></div></div>
      <label className="field full"><span>Reason for deleting this entry</span><input aria-label="Reason for deleting this entry" maxLength={300} minLength={2} onChange={(event) => setReason(event.target.value)} placeholder="For example: duplicate or accidental entry" required value={reason} /></label>
      <p className="delete-audit-note">A protected audit copy and this reason will be retained.</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-actions"><button className="button ghost" disabled={saving} onClick={close} type="button">Keep entry</button><button className="button danger" disabled={saving || reason.trim().length < 2} onClick={confirmDelete} type="button"><Trash2 size={15} />{saving ? "Deleting…" : "Delete entry"}</button></div>
    </dialog> : null}
  </>;
}
