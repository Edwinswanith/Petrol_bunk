"use client";

import { CheckCircle2, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { FinancePumpShiftEntry } from "@/server/services/finance-analytics-service";

type StaffOption = { id: string; name: string };
type CorrectionResult = { entry: FinancePumpShiftEntry; cascaded: FinancePumpShiftEntry[] };

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const formatMoney = (value: string) => money.format(Number(value));

export function PumpShiftCorrectionDialog({
  entry,
  stationLabels,
  staff,
  onClose
}: {
  entry: FinancePumpShiftEntry;
  stationLabels: Record<string, string>;
  staff: StaffOption[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const stationIds = Object.keys(entry.closingNozzleReadings);

  const [staffId, setStaffId] = useState(entry.staffId);
  const [shiftStartTime, setShiftStartTime] = useState(entry.shiftStartTime ?? "");
  const [shiftEndTime, setShiftEndTime] = useState(entry.shiftEndTime ?? "");
  const [closingNozzleReadings, setClosingNozzleReadings] = useState<Record<string, string>>(entry.closingNozzleReadings);
  const [testFuel, setTestFuel] = useState<Record<string, string>>(
    Object.fromEntries(stationIds.map((id) => [id, entry.nonSaleDispenses.find((dispense) => dispense.nozzleId === id)?.volume ?? "0"]))
  );
  const [testFuelReturned, setTestFuelReturned] = useState<Record<string, boolean>>(
    Object.fromEntries(stationIds.map((id) => [id, entry.nonSaleDispenses.find((dispense) => dispense.nozzleId === id)?.returnedToTank ?? false]))
  );
  const [collections, setCollections] = useState(entry.collections);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CorrectionResult | null>(null);

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  function handleClose() {
    dialogRef.current?.close();
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const nonSaleDispenses = stationIds
        .map((nozzleId) => ({ nozzleId, volume: testFuel[nozzleId] ?? "0", returnedToTank: testFuelReturned[nozzleId] === true }))
        .filter((dispense) => Number(dispense.volume) > 0);
      const response = await fetch(`/api/shifts/${entry.shiftId}/pumps/${entry.pumpId}/history/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId,
          staffName: staff.find((person) => person.id === staffId)?.name ?? entry.staffName,
          shiftStartTime: shiftStartTime || undefined,
          shiftEndTime: shiftEndTime || undefined,
          closingNozzleReadings,
          nonSaleDispenses,
          collections,
          reason
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the correction");
      const updatedHistory = (body.pumpShiftHistory ?? []) as FinancePumpShiftEntry[];
      const correctedEntry = updatedHistory.find((item) => item.id === entry.id) ?? entry;
      const cascaded = updatedHistory.filter((item) => item.cascadeAdjustment?.fromEntryId === entry.id);
      setResult({ entry: correctedEntry, cascaded });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the correction");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog className="pump-correction-dialog" onClose={onClose} ref={dialogRef}>
      <header className="dialog-header">
        <div><p className="panel-kicker">Correcting a completed pump-shift</p><h2 className="panel-title">{entry.pumpLabel} · {entry.businessDate}</h2></div>
        <button aria-label="Close" className="button ghost" onClick={handleClose} type="button"><X size={16} /></button>
      </header>

      {result ? (
        <div className="success-message" role="status">
          <CheckCircle2 size={21} />
          <span>
            <strong>Pump-shift corrected</strong>
            <span>New litres: {result.entry.litresSold} L · Revenue: {formatMoney(result.entry.expectedSalesValue)} · Variance: {formatMoney(result.entry.tenderVariance)}</span>
            {result.cascaded.length ? (
              <span>
                Adjusted downstream: {result.cascaded.map((item) => `${item.staffName} (${item.litresSold} L, ${formatMoney(item.expectedSalesValue)})`).join(", ")}
              </span>
            ) : null}
            <button className="button soft" onClick={handleClose} type="button">Close</button>
          </span>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field"><span>Employee</span><select onChange={(event) => setStaffId(event.target.value)} required value={staffId}>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label className="field"><span>Shift start</span><input onChange={(event) => setShiftStartTime(event.target.value)} type="time" value={shiftStartTime} /></label>
            <label className="field"><span>Shift end</span><input onChange={(event) => setShiftEndTime(event.target.value)} type="time" value={shiftEndTime} /></label>
          </div>

          <div className="form-grid three">
            {stationIds.map((stationId) => (
              <label className="field" key={stationId}>
                <span>{stationLabels[stationId] ?? stationId} · closing</span>
                <span className="input-wrap">
                  <input min="0" onChange={(event) => setClosingNozzleReadings({ ...closingNozzleReadings, [stationId]: event.target.value })} required step="0.001" type="number" value={closingNozzleReadings[stationId] ?? ""} />
                  <span className="unit">L</span>
                </span>
                <span className="input-wrap">
                  <input aria-label={`${stationLabels[stationId] ?? stationId} test fuel`} min="0" onChange={(event) => setTestFuel({ ...testFuel, [stationId]: event.target.value })} step="0.001" type="number" value={testFuel[stationId] ?? "0"} />
                  <span className="unit">test L</span>
                </span>
                {Number(testFuel[stationId] ?? 0) > 0 ? (
                  <span className="returned-check"><input checked={testFuelReturned[stationId] === true} onChange={(event) => setTestFuelReturned({ ...testFuelReturned, [stationId]: event.target.checked })} type="checkbox" />Returned to tank</span>
                ) : null}
              </label>
            ))}
          </div>

          <div className="form-grid three">
            {(["cash", "upi", "card", "credit", "other", "declaredCashHandover"] as const).map((key) => (
              <label className="field" key={key}>
                <span>{key === "declaredCashHandover" ? "Declared cash handover" : key.toUpperCase()}</span>
                <span className="input-wrap">
                  <input min="0" onChange={(event) => setCollections({ ...collections, [key]: event.target.value })} step="0.01" type="number" value={collections[key]} />
                  <span className="unit">₹</span>
                </span>
              </label>
            ))}
          </div>

          <label className="field full"><span>Reason for this correction</span><input maxLength={300} minLength={2} onChange={(event) => setReason(event.target.value)} placeholder="What was wrong and why?" required value={reason} /></label>

          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="form-actions">
            <button className="button ghost" onClick={handleClose} type="button">Cancel</button>
            <button className="button primary" disabled={saving} type="submit"><Save size={16} />{saving ? "Saving…" : "Save correction"}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}
