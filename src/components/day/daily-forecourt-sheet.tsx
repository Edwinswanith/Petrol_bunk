"use client";

import { Calculator, CheckCircle2, Fuel, Gauge, IndianRupee, LockKeyhole, PencilLine, Play, Plus } from "lucide-react";
import Link from "next/link";
import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";
import type { ShiftReconciliation } from "@/server/domain/operations";

type Product = { id: string; code: string; name: string; sellingPricePerLitre: string; costPricePerLitre: string; marketReferencePrice?: string };
type Staff = { id: string; name: string; monthlySalary: string };
type Station = {
  stationId: string; code: string; name: string; productId: string; productName: string; tankId: string; tankName: string;
  pricePerLitre: string; costPerLitre: string; marketReferencePrice?: string; dispenserId?: string; dispenserCode?: string;
  sideId?: string; sideLabel?: string; nozzleNumber?: number; displayOrder?: number;
};
type Tank = { tankId: string; productId: string; name: string; productName: string; currentStock: string };
type Attendance = { staffId: string; staffName: string; status: string };
type Assignment = { staffId: string; staffName: string; nozzleId: string };
type ActiveShift = {
  id: string; name: string; businessDate: string; startedAt: string; openingNozzleReadings: Record<string, string>;
  openingTankStocks: Record<string, string>; staffAssignments: Assignment[];
};

type Props = {
  businessDate: string;
  products: Product[];
  staff: Staff[];
  stations: Station[];
  tanks: Tank[];
  previousReadings: Record<string, string>;
  previousReadingSources?: Record<string, { shiftId: string; businessDate: string }>;
  activeShift?: ActiveShift;
  attendance: Attendance[];
};

type Side = { id: string; label: string; dispenserCode: string; stations: Station[]; assignment?: Assignment };
type Pump = { code: string; sides: Side[] };

function layout(stations: Station[], assignments: Assignment[] = []): Pump[] {
  const pumps = new Map<string, Map<string, Side>>();
  for (const station of [...stations].sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999) || a.code.localeCompare(b.code))) {
    const pumpCode = station.dispenserCode ?? station.code.split("-")[0] ?? "Pump";
    const sideId = station.sideId ?? station.stationId;
    const sides = pumps.get(pumpCode) ?? new Map<string, Side>();
    const side = sides.get(sideId) ?? {
      id: sideId, label: station.sideLabel ?? station.name, dispenserCode: pumpCode, stations: [],
      assignment: assignments.find((item) => item.nozzleId === station.stationId)
    };
    side.stations.push(station); sides.set(sideId, side); pumps.set(pumpCode, sides);
  }
  return [...pumps].map(([code, sides]) => ({ code, sides: [...sides.values()] })).sort((a, b) => a.code.localeCompare(b.code));
}

function number(value: FormDataEntryValue | null) {
  return String(value ?? "0") || "0";
}

function inr(value: string | undefined) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nozzleLabel(station: Station) {
  return station.nozzleNumber == null ? station.code : `N${station.nozzleNumber}`;
}

export function DailyForecourtSheet({ businessDate, products, staff, stations, tanks, previousReadings, previousReadingSources = {}, activeShift, attendance }: Props) {
  const router = useRouter();
  const pumps = useMemo(() => layout(stations, activeShift?.staffAssignments), [stations, activeShift]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ShiftReconciliation>();
  const [closedRecord, setClosedRecord] = useState<{ id: string; reconciliation: ShiftReconciliation }>();
  const initialOpenings = Object.fromEntries(stations.map((station) => [station.stationId, activeShift?.openingNozzleReadings[station.stationId] ?? previousReadings[station.stationId] ?? ""]));
  const [openingReadings, setOpeningReadings] = useState<Record<string, string>>(initialOpenings);
  const [closingReadings, setClosingReadings] = useState<Record<string, string>>(initialOpenings);
  const [operatorIds, setOperatorIds] = useState<Record<string, string>>(Object.fromEntries(stations.map((station) => [station.stationId, activeShift?.staffAssignments.find((assignment) => assignment.nozzleId === station.stationId)?.staffId ?? ""])));
  const [collections, setCollections] = useState<Record<string, Record<string, string>>>({});
  const [rates, setRates] = useState(Object.fromEntries(products.map((product) => { const snapshot = stations.find((station) => station.productId === product.id); return [product.id, { cost: activeShift ? snapshot?.costPerLitre ?? product.costPricePerLitre : product.costPricePerLitre, selling: activeShift ? snapshot?.pricePerLitre ?? product.sellingPricePerLitre : product.sellingPricePerLitre }]; })));
  const closeKey = useRef<string | undefined>(undefined);

  async function openDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await Promise.all(products.map(async (product) => {
        const sellingPrice = number(form.get(`selling-${product.id}`));
        const response = await fetch(`/api/products/${product.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sellingPricePerLitre: sellingPrice, costPricePerLitre: number(form.get(`cost-${product.id}`)), marketReferencePrice: sellingPrice })
        });
        const body = await response.json(); if (!response.ok) throw new Error(body.error ?? `Could not update ${product.name} price`);
      }));
      const assignments = stations.map((station) => {
        const staffId = String(form.get(`staff-${station.stationId}`) ?? "");
        const person = staff.find((item) => item.id === staffId);
        return { staffId, staffName: person?.name ?? "", nozzleId: station.stationId };
      });
      const response = await fetch("/api/shifts", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          name: "Daily forecourt sheet", businessDate: String(form.get("businessDate") ?? businessDate),
          staffOnDuty: [...new Set(assignments.map((item) => item.staffName))], staffAssignments: assignments,
          openingNozzleReadings: Object.fromEntries(stations.map((station) => [station.stationId, number(form.get(`opening-${station.stationId}`))])),
          openingTankStocks: Object.fromEntries(tanks.map((tank) => [tank.tankId, number(form.get(`tank-opening-${tank.tankId}`))])),
          stationOverrides: Object.fromEntries(stations.map((station) => { const productId = String(form.get(`fuel-${station.stationId}`) ?? station.productId); return [station.stationId, { productId, tankId: tanks.find((tank) => tank.productId === productId)?.tankId ?? station.tankId }]; }))
        })
      });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not start the business day");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not start the business day"); }
    finally { setSaving(false); }
  }

  function closePayload(form: FormData) {
    const sideCollections = Object.fromEntries(pumps.flatMap((pump) => pump.sides.map((side) => [side.id, {
      cash: number(form.get(`cash-${side.id}`)), upi: number(form.get(`upi-${side.id}`)), card: number(form.get(`card-${side.id}`)),
      credit: number(form.get(`credit-${side.id}`)), other: number(form.get(`other-${side.id}`)), declaredCashHandover: number(form.get(`handover-${side.id}`))
    }])));
    const sum = (key: keyof (typeof sideCollections)[string]) => Decimal.sum(0, ...Object.values(sideCollections).map((item) => item[key])).toDecimalPlaces(2).toFixed(2);
    const staffHandovers: Record<string, string> = {};
    for (const pump of pumps) for (const side of pump.sides) if (side.assignment) {
      const collection = sideCollections[side.id];
      const total = Decimal.sum(collection.cash, collection.upi, collection.card, collection.credit, collection.other);
      staffHandovers[side.assignment.staffId] = new Decimal(staffHandovers[side.assignment.staffId] ?? 0).plus(total).toDecimalPlaces(2).toFixed(2);
    }
    return {
      closingNozzleReadings: Object.fromEntries(stations.map((station) => [station.stationId, number(form.get(`closing-${station.stationId}`))])),
      closingTankStocks: Object.fromEntries(tanks.map((tank) => [tank.tankId, number(form.get(`tank-closing-${tank.tankId}`))])),
      nonSaleDispenses: stations.map((station) => ({ nozzleId: station.stationId, volume: number(form.get(`test-${station.stationId}`)), returnedToTank: form.get(`returned-${station.stationId}`) === "on" })).filter((entry) => Number(entry.volume) > 0),
      receipts: Object.fromEntries(tanks.map((tank) => [tank.tankId, "0"])), sideCollections, staffHandovers,
      payments: { cashSales: sum("cash"), upi: sum("upi"), card: sum("card"), credit: sum("credit"), other: sum("other"), cashReceipts: "0", cashExpenses: "0", cashRemovals: "0", declaredCashHandover: sum("declaredCashHandover") },
      lubricantRevenue: "0", lubricantCost: "0", expenses: "0", varianceExplanation: String(form.get("varianceExplanation") ?? "")
    };
  }

  async function persistActiveSetup(form: HTMLFormElement) {
    if (!activeShift) return;
    const assignments = stations.map((station) => { const staffId = operatorIds[station.stationId] ?? ""; return { staffId, staffName: staff.find((person) => person.id === staffId)?.name ?? "", nozzleId: station.stationId }; });
    const response = await fetch(`/api/shifts/${activeShift.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ openingNozzleReadings: openingReadings, staffAssignments: assignments, productRates: Object.fromEntries(products.map((product) => [product.id, { sellingPricePerLitre: rates[product.id].selling, costPricePerLitre: rates[product.id].cost }])), reason: String(new FormData(form).get("activeCorrectionReason") ?? "") }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not save today's setup");
  }

  async function saveActiveSetup() {
    const form = document.querySelector<HTMLFormElement>("#daily-closing-form"); if (!form) return; setSaving(true); setError("");
    try { await persistActiveSetup(form); setPreview(undefined); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save today's setup"); }
    finally { setSaving(false); }
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!activeShift) return; const form = event.currentTarget; setSaving(true); setError("");
    try {
      await persistActiveSetup(form);
      const response = await fetch(`/api/shifts/${activeShift.id}/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(closePayload(new FormData(form))) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not calculate the reconciliation"); setPreview(body);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not calculate the reconciliation"); }
    finally { setSaving(false); }
  }

  async function closeDay() {
    if (!activeShift || !preview) return; const form = document.querySelector<HTMLFormElement>("#daily-closing-form"); if (!form) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/shifts/${activeShift.id}/close`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": closeKey.current ??= crypto.randomUUID() }, body: JSON.stringify(closePayload(new FormData(form))) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not close the business day"); setClosedRecord(body); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not close the business day"); }
    finally { setSaving(false); }
  }

  const litres = (station: Station) => Math.max(0, Number(closingReadings[station.stationId] ?? 0) - Number(openingReadings[station.stationId] ?? 0));
  const stationRevenue = (station: Station) => litres(station) * Number(rates[station.productId]?.selling ?? station.pricePerLitre);
  const stationProfit = (station: Station) => litres(station) * (Number(rates[station.productId]?.selling ?? station.pricePerLitre) - Number(rates[station.productId]?.cost ?? station.costPerLitre));
  const monthlyPayroll = staff.reduce((sum, person) => sum + Number(person.monthlySalary || 0), 0);

  async function addOperator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); const form = new FormData(event.currentTarget);
    try { const response = await fetch("/api/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: String(form.get("name")), phone: "", note: "Added from Today", monthlySalary: "0" }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not add operator"); event.currentTarget.reset(); router.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not add operator"); } finally { setSaving(false); }
  }

  return <div className="daily-sheet">
    <section className="day-command panel">
      <div><p className="eyebrow">{businessDate} · Owner entry</p><h1>Today&apos;s forecourt sheet</h1><p>One page for staff, eight totalizers, collections and tank reconciliation.</p></div>
      <div className="day-status"><span className={`status-pill ${activeShift ? "warning" : "healthy"}`}>{closedRecord ? "CLOSED" : activeShift ? "OPEN" : "READY"}</span><small>{activeShift ? `Started ${new Date(activeShift.startedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : "Confirm the morning position"}</small></div>
    </section>

    {closedRecord ? <section className="closed-day-summary"><CheckCircle2 size={26} /><div><strong>Business day closed and inventory updated</strong><p>{inr(closedRecord.reconciliation.sales.expectedSales)} sales · {closedRecord.reconciliation.products?.reduce((sum, item) => sum + Number(item.litresSold), 0).toFixed(3)} L · {inr(closedRecord.reconciliation.sales.tenderVariance)} tender variance</p><div className="form-actions"><Link className="button primary" href={`/shifts/${closedRecord.id}`}>Open permanent day record</Link><Link className="button" href={`/finance?month=${businessDate.slice(0, 7)}`}>View finance</Link><Link className="button" href="/reports">View reports</Link></div></div></section> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}

    {!activeShift ? <><section className="today-setup-strip"><label className="field"><span>Business date</span><input form="daily-opening-form" defaultValue={businessDate} name="businessDate" type="date" required /></label><form className="inline-operator-form" onSubmit={addOperator}><label><span>Add operator without leaving Today</span><input name="name" placeholder="Operator name" required /></label><button className="button soft" disabled={saving}><Plus size={14} />Add</button></form><div className="attendance-chips">{attendance.map((record) => <span className={`attendance-chip ${record.status.toLowerCase()}`} key={record.staffId}>{record.staffName} · {record.status}</span>)}</div></section><form id="daily-opening-form" onSubmit={openDay}>
      <section className="daily-rate-board"><header><span><small>Step 1 · Set today&apos;s rates</small><strong>Dealer cost &amp; customer price</strong></span><p>These values are locked into today&apos;s sales record and will not change historical profit.</p></header><div className="daily-price-deck">
        {products.map((product) => <article className={`price-ticket ${product.id}`} key={product.id}><div className="price-product"><span className="fuel-dot" /><span><small>Fuel grade</small><strong>{product.name}</strong><small>Margin preview: {inr(String(Number(rates[product.id]?.selling ?? 0) - Number(rates[product.id]?.cost ?? 0)))} / L</small></span></div><label className="rate-field"><span><small>What the outlet pays</small><strong>Reseller purchase price</strong></span><span className="money-control"><b>₹</b><input aria-label={`${product.name} reseller purchase price`} value={rates[product.id]?.cost} onChange={(event) => setRates({ ...rates, [product.id]: { ...rates[product.id], cost: event.target.value } })} min="0" name={`cost-${product.id}`} required step="0.01" type="number" /><em>per litre</em></span></label><label className="rate-field customer"><span><small>Official price charged to customer</small><strong>Market/customer selling price</strong></span><span className="money-control"><b>₹</b><input aria-label={`${product.name} customer selling price`} value={rates[product.id]?.selling} onChange={(event) => setRates({ ...rates, [product.id]: { ...rates[product.id], selling: event.target.value } })} min="0" name={`selling-${product.id}`} required step="0.01" type="number" /><em>per litre</em></span></label></article>)}
      </div></section>
      <PumpDeck pumps={pumps} staff={staff} previousReadings={previousReadings} previousReadingSources={previousReadingSources} products={products} />
      <TankDeck mode="opening" tanks={tanks} />
      <div className="daily-sticky-action"><span><strong>{stations.length} nozzles · {pumps.flatMap((pump) => pump.sides).length} staff positions</strong><small>Opening values and prices are snapshotted for today.</small></span><button className="button primary" disabled={saving || !staff.length} type="submit"><Play size={16} />{saving ? "Starting…" : "Start business day"}</button></div>
    </form></> : !closedRecord ? <form id="daily-closing-form" onSubmit={review}>
      <section className="active-day-console"><div className="active-day-heading"><span><small>Open day control centre</small><strong>Rates, openings and employees remain correctable until close</strong></span><span className="payroll-commitment"><small>Salary commitment</small><strong>{inr(String(monthlyPayroll))}</strong><em>monthly payroll</em></span></div><div className="active-rate-grid">{products.map((product) => <article key={product.id}><span className={`fuel-chip ${product.id}`}>{product.name}</span><label><span>Reseller purchase</span><span className="input-wrap"><input aria-label={`${product.name} active reseller purchase price`} min="0" onChange={(event) => setRates({ ...rates, [product.id]: { ...rates[product.id], cost: event.target.value } })} step="0.01" type="number" value={rates[product.id]?.cost ?? ""} /><span className="unit">₹</span></span></label><label><span>Customer selling</span><span className="input-wrap"><input aria-label={`${product.name} active customer selling price`} min="0" onChange={(event) => setRates({ ...rates, [product.id]: { ...rates[product.id], selling: event.target.value } })} step="0.01" type="number" value={rates[product.id]?.selling ?? ""} /><span className="unit">₹</span></span></label><span className="rate-margin"><small>Margin / L</small><strong>{inr(String(Number(rates[product.id]?.selling || 0) - Number(rates[product.id]?.cost || 0)))}</strong></span></article>)}</div></section>
      <PumpClosingDeck pumps={pumps} staff={staff} openingReadings={openingReadings} setOpeningReadings={setOpeningReadings} operatorIds={operatorIds} setOperatorIds={setOperatorIds} closingReadings={closingReadings} setClosingReadings={setClosingReadings} litres={litres} revenue={stationRevenue} profit={stationProfit} collections={collections} setCollections={setCollections} />
      <TankDeck mode="closing" tanks={tanks} openingStocks={activeShift.openingTankStocks} />
      <label className="field active-correction-reason"><span>Reason for an opening, employee or rate correction</span><input name="activeCorrectionReason" placeholder="Optional unless correcting the morning sheet" /></label>
      <label className="field variance-note"><span>Variance explanation</span><textarea name="varianceExplanation" placeholder="Explain any payment, cash or physical tank difference before closing." /></label>
      {preview ? <ReconciliationPreview preview={preview} /> : null}
      <div className="daily-sticky-action"><span><strong>{preview ? `${inr(preview.sales.expectedSales)} expected · ${inr(preview.sales.accountedTender)} entered` : "Keep setup and closing on this page"}</strong><small>{preview ? `${inr(preview.sales.tenderVariance)} tender variance` : "Save setup changes, then review the canonical server calculation."}</small></span><div className="form-actions"><button className="button soft" disabled={saving} onClick={saveActiveSetup} type="button"><PencilLine size={15} />Save setup changes</button><button className="button" disabled={saving} type="submit"><Calculator size={16} />{saving ? "Calculating…" : "Review closing"}</button><button className="button primary" disabled={saving || !preview} onClick={closeDay} type="button"><LockKeyhole size={16} />Close day &amp; update tanks</button></div></div>
    </form> : null}
  </div>;
}

function PumpDeck({ pumps, staff, previousReadings, previousReadingSources, products }: { pumps: Pump[]; staff: Staff[]; previousReadings: Record<string, string>; previousReadingSources: Record<string, { shiftId: string; businessDate: string }>; products: Product[] }) {
  return <><div className="section-step"><span>2</span><div><small>Staff &amp; meter setup</small><strong>Confirm every nozzle&apos;s employee, fuel and opening totalizer</strong></div></div><section className="pump-deck opening-grid">{pumps.map((pump) => <article className="pump-card" key={pump.code}><header><span className="pump-emblem"><Fuel size={20} /></span><span><small>Opening setup</small><strong>Pump {pump.code}</strong></span><Gauge size={22} /></header><div className="pump-sides">{pump.sides.map((side) => <section className="pump-side" key={side.id}><div className="side-owner"><span><small>{side.label}</small><strong>{side.stations.map(nozzleLabel).join(" + ")}</strong></span></div><div className="nozzle-list">{side.stations.map((station) => <div className="nozzle-entry opening-row" key={station.stationId}><span className={`nozzle-badge ${station.productId}`}><Fuel size={14} />{nozzleLabel(station)}</span><label><span>Fuel</span><select aria-label={`${station.code} fuel grade`} defaultValue={station.productId} name={`fuel-${station.stationId}`}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label><span>Employee</span><select aria-label={`${station.code} operator`} name={`staff-${station.stationId}`} required><option value="">Select employee</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="totalizer-field"><span><PencilLine size={13} />Opening totalizer</span><span className="totalizer-control"><input aria-label={`${station.code} opening totalizer`} defaultValue={previousReadings[station.stationId] ?? ""} min="0" name={`opening-${station.stationId}`} placeholder="Enter reading" required step="0.001" type="number" /><em>L</em></span><small>{previousReadingSources[station.stationId] ? `From ${previousReadingSources[station.stationId].businessDate} closing` : "First opening — enter manually"}</small></label></div>)}</div></section>)}</div></article>)}</section></>;
}

function PumpClosingDeck({ pumps, staff, openingReadings, setOpeningReadings, operatorIds, setOperatorIds, closingReadings, setClosingReadings, litres, revenue, profit, collections, setCollections }: { pumps: Pump[]; staff: Staff[]; openingReadings: Record<string, string>; setOpeningReadings: (value: Record<string, string>) => void; operatorIds: Record<string, string>; setOperatorIds: (value: Record<string, string>) => void; closingReadings: Record<string, string>; setClosingReadings: (value: Record<string, string>) => void; litres: (station: Station) => number; revenue: (station: Station) => number; profit: (station: Station) => number; collections: Record<string, Record<string, string>>; setCollections: (value: Record<string, Record<string, string>>) => void }) {
  return <section className="pump-deck compact-pump-deck">{pumps.map((pump) => <article className="pump-card closing compact-pump" key={pump.code}><header><span className="pump-emblem"><Fuel size={20} /></span><span><small>Live nozzle ledger</small><strong>Pump {pump.code}</strong></span><span className="pump-total"><b>{pump.sides.flatMap((side) => side.stations).reduce((sum, station) => sum + litres(station), 0).toFixed(3)} L</b><small>metered today</small></span></header><div className="pump-sides">{pump.sides.map((side) => { const expected = side.stations.reduce((sum, station) => sum + revenue(station), 0); const entered = Object.entries(collections[side.id] ?? {}).filter(([key]) => key !== "handover").reduce((sum, [, value]) => sum + Number(value || 0), 0); return <section className="pump-side" key={side.id}><div className="side-owner"><span><small>{side.label}</small><strong>{side.stations.map(nozzleLabel).join(" + ")}</strong></span><span className="side-live"><strong>{side.stations.reduce((sum, station) => sum + litres(station), 0).toFixed(3)} L</strong><small>{inr(String(expected))} expected</small></span></div><div className="nozzle-list compact-nozzle-list">{side.stations.map((station) => { const opening = openingReadings[station.stationId] ?? ""; return <div className="nozzle-ledger-row" key={station.stationId}><div className="ledger-nozzle"><span className={`nozzle-badge ${station.productId}`}><Fuel size={14} />{nozzleLabel(station)}</span><small>{station.productName}</small></div><label><span>Employee</span><select aria-label={`${station.code} active operator`} onChange={(event) => setOperatorIds({ ...operatorIds, [station.stationId]: event.target.value })} required value={operatorIds[station.stationId] ?? ""}><option value="">Select</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label><span>Opening</span><span className="input-wrap"><input aria-label={`${station.code} editable opening totalizer`} min="0" onChange={(event) => { const next = event.target.value; const wasUnchanged = closingReadings[station.stationId] === opening; setOpeningReadings({ ...openingReadings, [station.stationId]: next }); if (wasUnchanged) setClosingReadings({ ...closingReadings, [station.stationId]: next }); }} required step="0.001" type="number" value={opening} /><span className="unit">L</span></span></label><label><span>Closing</span><span className="input-wrap"><input aria-label={`${station.code} closing totalizer`} min={opening || "0"} name={`closing-${station.stationId}`} onChange={(event) => setClosingReadings({ ...closingReadings, [station.stationId]: event.target.value })} required step="0.001" type="number" value={closingReadings[station.stationId] ?? ""} /><span className="unit">L</span></span></label><label className="test-fuel-field"><span>Test fuel</span><span className="input-wrap"><input defaultValue="0" min="0" name={`test-${station.stationId}`} step="0.001" type="number" /><span className="unit">L</span></span><span className="returned-check"><input name={`returned-${station.stationId}`} type="checkbox" />Returned</span></label><div className="ledger-result"><strong>{litres(station).toFixed(3)} L</strong><span>{inr(String(revenue(station)))}</span><small>{inr(String(profit(station)))} profit</small></div></div>; })}</div><SideCollections side={side} expected={expected} entered={entered} values={collections[side.id] ?? {}} onChange={(values) => setCollections({ ...collections, [side.id]: values })} /></section>; })}</div></article>)}</section>;
}

function SideCollections({ side, expected, entered, values, onChange }: { side: Side; expected: number; entered: number; values: Record<string, string>; onChange: (values: Record<string, string>) => void }) {
  const fields = [["cash", "Cash"], ["upi", "UPI"], ["card", "Card"], ["credit", "Credit"], ["other", "Other"], ["handover", "Cash handed over"]];
  return <div className="side-collections"><div><IndianRupee size={16} /><span><strong>Collections</strong><small>Nozzle employees · expected {inr(String(expected))} · entered {inr(String(entered))} · variance {inr(String(entered - expected))}</small></span></div><div className="collection-grid">{fields.map(([key, label]) => <label key={key}><span>{label}</span><span className="input-wrap"><input value={values[key] ?? "0"} onChange={(event) => onChange({ ...values, [key]: event.target.value })} min="0" name={`${key}-${side.id}`} step="0.01" type="number" /><span className="unit">₹</span></span></label>)}</div></div>;
}

function TankDeck({ tanks, mode, openingStocks = {} }: { tanks: Tank[]; mode: "opening" | "closing"; openingStocks?: Record<string, string> }) {
  return <section className="tank-ribbon"><div><Fuel size={20} /><span><small>Connected inventory</small><strong>{mode === "opening" ? "Confirm opening tank stock" : "Enter physical closing stock"}</strong></span></div>{tanks.map((tank) => <label key={tank.tankId}><span><strong>{tank.name}</strong><small>{mode === "closing" ? `Opening ${openingStocks[tank.tankId]} L` : tank.productName}</small></span><span className="input-wrap"><input defaultValue={mode === "opening" ? tank.currentStock : openingStocks[tank.tankId]} min="0" name={`tank-${mode}-${tank.tankId}`} required step="0.001" type="number" /><span className="unit">L</span></span></label>)}</section>;
}

function ReconciliationPreview({ preview }: { preview: ShiftReconciliation }) {
  return <section className="daily-reconciliation"><header><span><small>Server-calculated preview</small><strong>{inr(preview.sales.expectedSales)} expected sales</strong><small>{inr(preview.sales.expectedCashHandover)} expected cash handover · {inr(preview.sales.cashVariance)} cash variance</small></span><span className={preview.sales.tenderVariance === "0.00" ? "status-pill healthy" : "status-pill warning"}>{preview.sales.tenderVariance === "0.00" ? "Tallied" : `${inr(preview.sales.tenderVariance)} variance`}</span></header><div className="side-result-grid">{preview.sides?.map((side) => <article key={side.sideId}><span><small>Pump {side.dispenserCode} · {side.sideLabel}</small><strong>{side.staffName}</strong></span><dl><div><dt>Litres</dt><dd>{side.litresSold} L</dd></div><div><dt>Expected</dt><dd>{inr(side.expectedSalesValue)}</dd></div><div><dt>Entered</dt><dd>{inr(side.accountedTender)}</dd></div><div><dt>Variance</dt><dd className={side.tenderVariance === "0.00" ? "balanced" : "unbalanced"}>{inr(side.tenderVariance)}</dd></div></dl><div className="payment-result"><span>Cash {inr(side.cash)}</span><span>UPI {inr(side.upi)}</span><span>Card {inr(side.card)}</span><span>Credit {inr(side.credit)}</span><span>Other {inr(side.other)}</span><span>Handed over {inr(side.declaredCashHandover)}</span></div><div className="side-product-split">{(side.products ?? []).map((product) => <span key={product.productId}><b>{product.productName}</b>{product.litresSold} L · {inr(product.revenue)} · {inr(product.grossProfit)} profit</span>)}</div></article>)}</div><div className="product-result-row">{preview.products?.map((product) => <span key={product.productId}><small>{product.productName}</small><strong>{product.litresSold} L · {inr(product.revenue)}</strong></span>)}</div><div className="tank-result-grid">{Object.entries(preview.tanks).map(([tankId, tank]) => <article key={tankId}><small>{tankId.replaceAll("_", " ")}</small><strong>{tank.expectedClosingStock} L expected</strong><span>{tank.actualClosingStock} L physical · {tank.variance} L variance</span></article>)}</div><div className="employee-result-grid">{preview.staff?.map((person) => <article key={`${person.staffId}:${person.nozzleId}`}><strong>{person.staffName}</strong><span>{person.product} · {person.litresSold} L · {inr(person.expectedSalesValue)}</span><small>{person.machineLabel}</small></article>)}</div></section>;
}
