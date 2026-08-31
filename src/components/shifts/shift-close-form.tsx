"use client";

import { AlertTriangle, CheckCircle2, Gauge, LockKeyhole } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import type { StaffAssignment } from "@/server/domain/operations";

type ReconciliationPreview = {
  sales: {
    expectedSales: string;
    accountedTender: string;
    tenderVariance: string;
    expectedCashHandover: string;
    cashVariance: string;
  };
  tanks: Record<string, { variance: string; variancePercent: string }>;
  grossMargin: string;
  estimatedOperatingProfit: string;
  staff: Array<{ staffId: string; staffName: string; machineLabel: string; litresSold: string; expectedSalesValue: string; declaredHandover: string; handoverVariance: string }>;
};

type Defaults = {
  petrolClosing: string;
  dieselClosing: string;
  petrolStock: string;
  dieselStock: string;
  cashSales: string;
  upi: string;
};

function inr(value: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value));
}

function formValue(form: FormData, name: string) {
  return String(form.get(name) ?? "0");
}

function optionalText(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

export function ShiftCloseForm({ shiftId, defaults, assignments = [] }: { shiftId: string; defaults: Defaults; assignments?: StaffAssignment[] }) {
  const [preview, setPreview] = useState<ReconciliationPreview | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [closed, setClosed] = useState(false);
  const closeKey = useRef<string | null>(null);

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setPreview(null);
    const data = new FormData(event.currentTarget);
    const nonSaleDispenses = [
      { nozzleId: "petrol_1", volume: formValue(data, "petrolTestVolume"), returnedToTank: data.get("petrolTestReturned") === "on" },
      { nozzleId: "diesel_1", volume: formValue(data, "dieselTestVolume"), returnedToTank: data.get("dieselTestReturned") === "on" }
    ].filter((entry) => Number(entry.volume) > 0);
    const requestPayload = {
      closingNozzleReadings: {
        petrol_1: formValue(data, "petrolClosing"),
        diesel_1: formValue(data, "dieselClosing")
      },
      closingTankStocks: {
        petrol_tank: formValue(data, "petrolStock"),
        diesel_tank: formValue(data, "dieselStock")
      },
      nonSaleDispenses,
      receipts: { petrol_tank: "0", diesel_tank: "0" },
      payments: {
        cashSales: formValue(data, "cashSales"),
        upi: formValue(data, "upi"),
        card: formValue(data, "card"),
        credit: formValue(data, "credit"),
        other: formValue(data, "other"),
        cashReceipts: "0",
        cashExpenses: "0",
        cashRemovals: "0",
        declaredCashHandover: formValue(data, "declaredCashHandover")
      },
      lubricantRevenue: formValue(data, "lubricantRevenue"),
      lubricantCost: formValue(data, "lubricantCost"),
      expenses: "0",
      staffHandovers: Object.fromEntries(assignments.map((assignment) => [assignment.staffId, formValue(data, `handover-${assignment.staffId}`)])),
      varianceExplanation: optionalText(data, "varianceExplanation")
    };

    try {
      const response = await fetch(`/api/shifts/${shiftId}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not calculate the shift");
      setPayload(requestPayload);
      setPreview(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not calculate the shift");
    } finally {
      setLoading(false);
    }
  }

  async function closeShift() {
    if (!payload) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/shifts/${shiftId}/close`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": closeKey.current ??= crypto.randomUUID()
        },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not close the shift");
      setClosed(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not close the shift");
    } finally {
      setLoading(false);
    }
  }

  if (closed) {
    return (
      <div className="success-message" role="status">
        <CheckCircle2 aria-hidden="true" size={21} />
        <span><strong>Shift closed and locked</strong><span>The reconciliation snapshot and original readings are now protected. Return to the dashboard to see the updated position.</span></span>
      </div>
    );
  }

  return (
    <form onSubmit={review}>
      <section className="form-section">
        <div className="form-section-heading"><span className="step-number">1</span><div><h2>Closing meter readings</h2><p>Enter exactly what is shown on each nozzle totalizer.</p></div></div>
        <div className="form-grid">
          <label className="field"><span>Petrol closing meter</span><span className="input-wrap"><input defaultValue={defaults.petrolClosing} name="petrolClosing" required step="0.001" type="number" /><span className="unit">L</span></span><span className="field-help">Opening: 182,350.250 L · Nozzle P1</span></label>
          <label className="field"><span>Diesel closing meter</span><span className="input-wrap"><input defaultValue={defaults.dieselClosing} name="dieselClosing" required step="0.001" type="number" /><span className="unit">L</span></span><span className="field-help">Opening: 92,540.000 L · Nozzle D1</span></label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading"><span className="step-number">2</span><div><h2>Test fuel and physical stock</h2><p>Returned tests do not reduce tank stock. Saved fuel receipts are added automatically.</p></div></div>
        <div className="form-grid" style={{ marginBottom: 14 }}>
          <label className="field"><span>Petrol test fuel, if any</span><span className="input-wrap"><input defaultValue="0" min="0" name="petrolTestVolume" step="0.001" type="number" /><span className="unit">L</span></span><span className="checkbox-row"><input name="petrolTestReturned" type="checkbox" /> Returned to petrol tank</span></label>
          <label className="field"><span>Diesel test fuel, if any</span><span className="input-wrap"><input defaultValue="0" min="0" name="dieselTestVolume" step="0.001" type="number" /><span className="unit">L</span></span><span className="checkbox-row"><input name="dieselTestReturned" type="checkbox" /> Returned to diesel tank</span></label>
        </div>
        <div className="form-grid">
          <label className="field"><span>Petrol tank stock</span><span className="input-wrap"><input defaultValue={defaults.petrolStock} name="petrolStock" required step="0.001" type="number" /><span className="unit">L</span></span></label>
          <label className="field"><span>Diesel tank stock</span><span className="input-wrap"><input defaultValue={defaults.dieselStock} name="dieselStock" required step="0.001" type="number" /><span className="unit">L</span></span></label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading"><span className="step-number">3</span><div><h2>Collections and expenses</h2><p>Tender totals are checked separately from the physical cash handover.</p></div></div>
        <div className="form-grid three">
          <label className="field"><span>Cash sales</span><span className="input-wrap"><input defaultValue={defaults.cashSales} name="cashSales" required step="0.01" type="number" /><span className="unit">₹</span></span></label>
          <label className="field"><span>UPI</span><span className="input-wrap"><input defaultValue={defaults.upi} name="upi" required step="0.01" type="number" /><span className="unit">₹</span></span></label>
          <label className="field"><span>Card</span><span className="input-wrap"><input defaultValue="0" name="card" step="0.01" type="number" /><span className="unit">₹</span></span></label>
          <label className="field"><span>Credit</span><span className="input-wrap"><input defaultValue="0" name="credit" step="0.01" type="number" /><span className="unit">₹</span></span></label>
          <label className="field"><span>Other tender</span><span className="input-wrap"><input defaultValue="0" name="other" step="0.01" type="number" /><span className="unit">₹</span></span></label>
          <label className="field"><span>Declared cash handover</span><span className="input-wrap"><input defaultValue={defaults.cashSales} name="declaredCashHandover" required step="0.01" type="number" /><span className="unit">₹</span></span></label>
          <label className="field"><span>Lubricant revenue</span><span className="input-wrap"><input defaultValue="0" name="lubricantRevenue" step="0.01" type="number" /><span className="unit">₹</span></span></label>
          <label className="field"><span>Lubricant cost</span><span className="input-wrap"><input defaultValue="0" name="lubricantCost" step="0.01" type="number" /><span className="unit">₹</span></span></label>
          <p className="field-help full">Expenses already recorded under Money &amp; margin are applied to this shift automatically, including cash-paid expenses in the handover check.</p>
          <label className="field full"><span>Variance explanation, if needed</span><textarea name="varianceExplanation" placeholder="What explains the difference? This stays in the shift history." /></label>
        </div>
      </section>

      {assignments.length ? <section className="form-section">
        <div className="form-section-heading"><span className="step-number">4</span><div><h2>Operator handovers</h2><p>Record the total sales value each assigned operator declares for their machine.</p></div></div>
        <div className="handover-grid">{assignments.map((assignment) => <label className="handover-card" key={assignment.staffId}>
          <span className={`machine-code ${assignment.nozzleId.startsWith("diesel") ? "diesel" : ""}`}>{assignment.nozzleId === "petrol_1" ? "P1" : "D1"}</span>
          <span><strong>{assignment.staffName}</strong><small>{assignment.nozzleId === "petrol_1" ? "Petrol machine" : "Diesel machine"}</small></span>
          <span className="input-wrap"><input aria-label={`${assignment.staffName} declared handover`} defaultValue="0" min="0" name={`handover-${assignment.staffId}`} required step="0.01" type="number" /><span className="unit">₹</span></span>
        </label>)}</div>
      </section> : null}

      {error ? <p className="form-error" role="alert"><AlertTriangle aria-hidden="true" size={15} /> {error}</p> : null}

      {preview ? (
        <section className="reconciliation-card" aria-label="Reconciliation preview">
          <div className="reconciliation-hero">
            <div><span>Expected sales</span><strong className="mono">{inr(preview.sales.expectedSales)}</strong></div>
            <span className={preview.sales.tenderVariance === "0.00" ? "status-pill healthy" : "status-pill warning"}>{preview.sales.tenderVariance === "0.00" ? "Balanced" : "Variance"}</span>
          </div>
          <div className="reconciliation-grid">
            <div><span>Tender check</span><strong>{preview.sales.tenderVariance === "0.00" ? "No payment variance" : `${inr(preview.sales.tenderVariance)} variance`}</strong></div>
            <div><span>Cash handover</span><strong>{preview.sales.cashVariance === "0.00" ? "Cash matches" : `${inr(preview.sales.cashVariance)} variance`}</strong></div>
            <div><span>Est. operating profit</span><strong className="mono">{inr(preview.estimatedOperatingProfit)}</strong></div>
          </div>
          {preview.staff?.length ? <div className="staff-preview-list">{preview.staff.map((result) => <div className="staff-preview-row" key={result.staffId}><span><strong>{result.staffName}</strong><small>{result.machineLabel} · {result.litresSold} L</small></span><span><small>Expected</small><strong>{inr(result.expectedSalesValue)}</strong></span><span><small>Handover variance</small><strong>{inr(result.handoverVariance)}</strong></span></div>)}</div> : null}
        </section>
      ) : null}

      <div className="form-actions">
        <button className="button" disabled={loading} type="submit"><Gauge aria-hidden="true" size={16} />{loading && !preview ? "Calculating…" : "Review reconciliation"}</button>
        <button className="button primary" disabled={!preview || loading} onClick={closeShift} type="button"><LockKeyhole aria-hidden="true" size={15} />Close shift</button>
      </div>
    </form>
  );
}
