"use client";

import { AlertTriangle, CheckCircle2, Gauge, LockKeyhole } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import type { StaffAssignment, StationSnapshot, TankSnapshot } from "@/server/domain/operations";

type ReconciliationPreview = {
  sales: { expectedSales: string; accountedTender: string; tenderVariance: string; expectedCashHandover: string; cashVariance: string };
  tanks: Record<string, { expectedClosingStock: string; actualClosingStock: string; variance: string; variancePercent: string }>;
  products?: Array<{ productId: string; productName: string; litresSold: string; revenue: string }>;
  grossMargin: string; estimatedOperatingProfit: string;
  staff?: Array<{ staffId: string; staffName: string; nozzleId: string; machineLabel: string; litresSold: string; expectedSalesValue: string; declaredHandover: string; handoverVariance: string }>;
};
type Defaults = {
  stationClosings?: Record<string, string>; tankStocks?: Record<string, string>;
  petrolClosing?: string; dieselClosing?: string; petrolStock?: string; dieselStock?: string;
  cashSales: string; upi: string;
};

const legacyStations: StationSnapshot[] = [
  { stationId: "petrol_1", code: "P1", name: "Petrol machine", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol tank", pricePerLitre: "102.50", costPerLitre: "96.80" },
  { stationId: "diesel_1", code: "D1", name: "Diesel machine", productId: "diesel", productName: "Diesel", tankId: "diesel_tank", tankName: "Diesel tank", pricePerLitre: "100.50", costPerLitre: "94.40" }
];
const legacyTanks: TankSnapshot[] = [
  { tankId: "petrol_tank", code: "PT1", name: "Petrol tank", productId: "petrol", productName: "Petrol", capacityLitres: "20000" },
  { tankId: "diesel_tank", code: "DT1", name: "Diesel tank", productId: "diesel", productName: "Diesel", capacityLitres: "20000" }
];

function inr(value: string) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value)); }
function formValue(form: FormData, name: string) { return String(form.get(name) ?? "0"); }

export function ShiftCloseForm({ shiftId, defaults, assignments = [], stations = legacyStations, tanks = legacyTanks, openingReadings = {} }: {
  shiftId: string; defaults: Defaults; assignments?: StaffAssignment[]; stations?: StationSnapshot[]; tanks?: TankSnapshot[]; openingReadings?: Record<string, string>;
}) {
  const [preview, setPreview] = useState<ReconciliationPreview | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const [closed, setClosed] = useState(false);
  const closeKey = useRef<string | null>(null);
  const closingDefault = (id: string) => defaults.stationClosings?.[id] ?? (id === "petrol_1" ? defaults.petrolClosing : id === "diesel_1" ? defaults.dieselClosing : openingReadings[id]) ?? openingReadings[id] ?? "";
  const stockDefault = (id: string) => defaults.tankStocks?.[id] ?? (id === "petrol_tank" ? defaults.petrolStock : id === "diesel_tank" ? defaults.dieselStock : "") ?? "";

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(""); setPreview(null);
    const data = new FormData(event.currentTarget);
    const nonSaleDispenses = stations.map((station) => ({ nozzleId: station.stationId, volume: formValue(data, `test-${station.stationId}`), returnedToTank: data.get(`returned-${station.stationId}`) === "on" })).filter((entry) => Number(entry.volume) > 0);
    const requestPayload = {
      closingNozzleReadings: Object.fromEntries(stations.map((station) => [station.stationId, formValue(data, `closing-${station.stationId}`)])),
      closingTankStocks: Object.fromEntries(tanks.map((tank) => [tank.tankId, formValue(data, `stock-${tank.tankId}`)])),
      nonSaleDispenses, receipts: Object.fromEntries(tanks.map((tank) => [tank.tankId, "0"])),
      payments: { cashSales: formValue(data, "cashSales"), upi: formValue(data, "upi"), card: formValue(data, "card"), credit: formValue(data, "credit"), other: formValue(data, "other"), cashReceipts: "0", cashExpenses: "0", cashRemovals: "0", declaredCashHandover: formValue(data, "declaredCashHandover") },
      lubricantRevenue: formValue(data, "lubricantRevenue"), lubricantCost: formValue(data, "lubricantCost"), expenses: "0",
      staffHandovers: Object.fromEntries([...new Set(assignments.map((assignment) => assignment.staffId))].map((staffId) => [staffId, formValue(data, `handover-${staffId}`)])),
      varianceExplanation: String(data.get("varianceExplanation") ?? "").trim()
    };
    try {
      const response = await fetch(`/api/shifts/${shiftId}/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestPayload) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not calculate the shift");
      setPayload(requestPayload); setPreview(body);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not calculate the shift"); }
    finally { setLoading(false); }
  }

  async function closeShift() {
    if (!payload) return; setLoading(true); setError("");
    try {
      const response = await fetch(`/api/shifts/${shiftId}/close`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": closeKey.current ??= crypto.randomUUID() }, body: JSON.stringify(payload) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not close the shift"); setClosed(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not close the shift"); }
    finally { setLoading(false); }
  }

  if (closed) return <div className="success-message" role="status"><CheckCircle2 size={21} /><span><strong>Shift closed and inventory updated</strong><span>Station outflow has been deducted from each connected tank and the reconciliation is locked.</span></span></div>;

  return <form onSubmit={review}>
    <section className="form-section"><div className="form-section-heading"><span className="step-number">1</span><div><h2>Closing station readings</h2><p>Enter each totalizer. Litres and revenue are calculated from its opening snapshot.</p></div></div><div className="form-grid">{stations.map((station) => <label className="field" key={station.stationId}><span>{station.code} · {station.productName}</span><span className="input-wrap"><input defaultValue={closingDefault(station.stationId)} min={openingReadings[station.stationId] ?? "0"} name={`closing-${station.stationId}`} required step="0.001" type="number" /><span className="unit">L</span></span><span className="field-help">Opening {openingReadings[station.stationId] ?? "—"} L · ₹{station.pricePerLitre}/L</span></label>)}</div></section>
    <section className="form-section"><div className="form-section-heading"><span className="step-number">2</span><div><h2>Test fuel and physical tank stock</h2><p>Returned tests do not reduce inventory. Unreturned tests reduce stock without revenue.</p></div></div><div className="form-grid" style={{ marginBottom: 14 }}>{stations.map((station) => <label className="field" key={station.stationId}><span>{station.code} test fuel</span><span className="input-wrap"><input defaultValue="0" min="0" name={`test-${station.stationId}`} step="0.001" type="number" /><span className="unit">L</span></span><span className="checkbox-row"><input name={`returned-${station.stationId}`} type="checkbox" /> Returned to {station.tankName}</span></label>)}</div><div className="form-grid">{tanks.map((tank) => <label className="field" key={tank.tankId}><span>{tank.name} physical closing stock</span><span className="input-wrap"><input defaultValue={stockDefault(tank.tankId)} min="0" name={`stock-${tank.tankId}`} required step="0.001" type="number" /><span className="unit">L</span></span></label>)}</div></section>
    <section className="form-section"><div className="form-section-heading"><span className="step-number">3</span><div><h2>Collections</h2><p>All tender channels must tally with calculated station revenue.</p></div></div><div className="form-grid three">{[["cashSales","Cash sales",defaults.cashSales],["upi","UPI",defaults.upi],["card","Card","0"],["credit","Credit","0"],["other","Other tender","0"],["declaredCashHandover","Declared cash handover",defaults.cashSales],["lubricantRevenue","Lubricant revenue","0"],["lubricantCost","Lubricant cost","0"]].map(([name,label,value]) => <label className="field" key={name}><span>{label}</span><span className="input-wrap"><input defaultValue={value} min="0" name={name} required step="0.01" type="number" /><span className="unit">₹</span></span></label>)}<label className="field full"><span>Variance explanation</span><textarea name="varianceExplanation" placeholder="Explain any payment or physical stock difference." /></label></div></section>
    {assignments.length ? <section className="form-section"><div className="form-section-heading"><span className="step-number">4</span><div><h2>Operator handovers</h2><p>One declaration per operator, covering all stations allocated to that person.</p></div></div><div className="handover-grid">{[...new Map(assignments.map((assignment) => [assignment.staffId, assignment])).values()].map((assignment) => { const assignedStations = assignments.filter((item) => item.staffId === assignment.staffId).map((item) => stations.find((station) => station.stationId === item.nozzleId)?.code ?? item.nozzleId); return <label className="handover-card" key={assignment.staffId}><span className="machine-code">{assignedStations.length}</span><span><strong>{assignment.staffName}</strong><small>{assignedStations.join(", ")}</small></span><span className="input-wrap"><input aria-label={`${assignment.staffName} declared handover`} defaultValue="0" min="0" name={`handover-${assignment.staffId}`} step="0.01" type="number" /><span className="unit">₹</span></span></label>; })}</div></section> : null}
    {error ? <p className="form-error" role="alert"><AlertTriangle size={15} /> {error}</p> : null}
    {preview ? <section className="reconciliation-card" aria-label="Reconciliation preview"><div className="reconciliation-hero"><div><span>Expected sales</span><strong className="mono">{inr(preview.sales.expectedSales)}</strong></div><span className={preview.sales.tenderVariance === "0.00" ? "status-pill healthy" : "status-pill warning"}>{preview.sales.tenderVariance === "0.00" ? "Balanced" : "Variance"}</span></div><div className="reconciliation-grid"><div><span>Tender check</span><strong>{preview.sales.tenderVariance === "0.00" ? "No payment variance" : `${inr(preview.sales.tenderVariance)} variance`}</strong></div><div><span>Cash handover</span><strong>{preview.sales.cashVariance === "0.00" ? "Cash matches" : `${inr(preview.sales.cashVariance)} variance`}</strong></div><div><span>Est. operating profit</span><strong>{inr(preview.estimatedOperatingProfit)}</strong></div></div>{preview.products?.length ? <div className="staff-preview-list">{preview.products.map((product) => <div className="staff-preview-row" key={product.productId}><span><strong>{product.productName}</strong><small>{product.litresSold} L sold</small></span><span><small>Revenue</small><strong>{inr(product.revenue)}</strong></span></div>)}</div> : null}{preview.staff?.length ? <div className="staff-preview-list">{preview.staff.map((result) => <div className="staff-preview-row" key={result.staffId}><span><strong>{result.staffName}</strong><small>{result.machineLabel} · {result.litresSold} L</small></span><span><small>Expected sales</small><strong>{inr(result.expectedSalesValue)}</strong></span><span><small>Handover variance</small><strong>{inr(result.handoverVariance)}</strong></span></div>)}</div> : null}<div className="staff-preview-list">{tanks.map((tank) => { const result = preview.tanks[tank.tankId]; return result ? <div className="staff-preview-row" key={tank.tankId}><span><strong>{tank.name}</strong><small>Book closing {result.expectedClosingStock} L</small></span><span><small>Physical variance</small><strong>{result.variance} L</strong></span></div> : null; })}</div></section> : null}
    <div className="form-actions"><button className="button" disabled={loading} type="submit"><Gauge size={16} />{loading && !preview ? "Calculating…" : "Review reconciliation"}</button><button className="button primary" disabled={!preview || loading} onClick={closeShift} type="button"><LockKeyhole size={15} />Close shift and update stock</button></div>
  </form>;
}
