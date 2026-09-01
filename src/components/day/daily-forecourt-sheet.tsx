"use client";

import { Calculator, CheckCircle2, Fuel, Gauge, IndianRupee, LockKeyhole, Play, UserRound } from "lucide-react";
import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";
import type { ShiftReconciliation } from "@/server/domain/operations";

type Product = { id: string; code: string; name: string; sellingPricePerLitre: string; costPricePerLitre: string; marketReferencePrice?: string };
type Staff = { id: string; name: string };
type Station = {
  stationId: string; code: string; name: string; productId: string; productName: string; tankId: string; tankName: string;
  pricePerLitre: string; costPerLitre: string; marketReferencePrice?: string; dispenserId?: string; dispenserCode?: string;
  sideId?: string; sideLabel?: string; nozzleNumber?: number; displayOrder?: number;
};
type Tank = { tankId: string; name: string; productName: string; currentStock: string };
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
  activeShift?: ActiveShift;
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

export function DailyForecourtSheet({ businessDate, products, staff, stations, tanks, previousReadings, activeShift }: Props) {
  const router = useRouter();
  const pumps = useMemo(() => layout(stations, activeShift?.staffAssignments), [stations, activeShift]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ShiftReconciliation>();
  const [closed, setClosed] = useState(false);
  const [closingReadings, setClosingReadings] = useState<Record<string, string>>(activeShift?.openingNozzleReadings ?? {});
  const closeKey = useRef<string | undefined>(undefined);

  async function openDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await Promise.all(products.map(async (product) => {
        const market = number(form.get(`market-${product.id}`));
        const response = await fetch(`/api/products/${product.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sellingPricePerLitre: number(form.get(`selling-${product.id}`)), costPricePerLitre: number(form.get(`cost-${product.id}`)), ...(market === "0" ? {} : { marketReferencePrice: market }) })
        });
        const body = await response.json(); if (!response.ok) throw new Error(body.error ?? `Could not update ${product.name} price`);
      }));
      const assignments = pumps.flatMap((pump) => pump.sides.flatMap((side) => {
        const staffId = String(form.get(`staff-${side.id}`) ?? "");
        const person = staff.find((item) => item.id === staffId);
        return side.stations.map((station) => ({ staffId, staffName: person?.name ?? "", nozzleId: station.stationId }));
      }));
      const response = await fetch("/api/shifts", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          name: "Daily forecourt sheet", businessDate,
          staffOnDuty: [...new Set(assignments.map((item) => item.staffName))], staffAssignments: assignments,
          openingNozzleReadings: Object.fromEntries(stations.map((station) => [station.stationId, number(form.get(`opening-${station.stationId}`))])),
          openingTankStocks: Object.fromEntries(tanks.map((tank) => [tank.tankId, number(form.get(`tank-opening-${tank.tankId}`))]))
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

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!activeShift) return; setSaving(true); setError("");
    try {
      const response = await fetch(`/api/shifts/${activeShift.id}/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(closePayload(new FormData(event.currentTarget))) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not calculate the reconciliation"); setPreview(body);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not calculate the reconciliation"); }
    finally { setSaving(false); }
  }

  async function closeDay() {
    if (!activeShift || !preview) return; const form = document.querySelector<HTMLFormElement>("#daily-closing-form"); if (!form) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/shifts/${activeShift.id}/close`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": closeKey.current ??= crypto.randomUUID() }, body: JSON.stringify(closePayload(new FormData(form))) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not close the business day"); setClosed(true); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not close the business day"); }
    finally { setSaving(false); }
  }

  const litres = (station: Station) => Math.max(0, Number(closingReadings[station.stationId] ?? 0) - Number(activeShift?.openingNozzleReadings[station.stationId] ?? 0));

  return <div className="daily-sheet">
    <section className="day-command panel">
      <div><p className="eyebrow">{businessDate} · Owner entry</p><h1>Today&apos;s forecourt sheet</h1><p>One page for staff, eight totalizers, collections and tank reconciliation.</p></div>
      <div className="day-status"><span className={`status-pill ${activeShift ? "warning" : "healthy"}`}>{closed ? "CLOSED" : activeShift ? "OPEN" : "READY"}</span><small>{activeShift ? `Started ${new Date(activeShift.startedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : "Confirm the morning position"}</small></div>
    </section>

    {closed ? <div className="success-message"><CheckCircle2 size={22} /><span><strong>Business day closed</strong><span>All nozzle sales and tank movements are locked.</span></span></div> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}

    {!activeShift ? <form onSubmit={openDay}>
      <section className="daily-price-deck">
        {products.map((product) => <article className="price-ticket" key={product.id}><div><span className="fuel-dot" /><strong>{product.name}</strong><small>Daily price snapshot</small></div><label><span>Selling price</span><span className="input-wrap"><input defaultValue={product.sellingPricePerLitre} min="0" name={`selling-${product.id}`} required step="0.01" type="number" /><span className="unit">₹/L</span></span></label><label><span>Purchase cost</span><span className="input-wrap"><input defaultValue={product.costPricePerLitre} min="0" name={`cost-${product.id}`} required step="0.01" type="number" /><span className="unit">₹/L</span></span></label><label><span>Market reference</span><span className="input-wrap"><input defaultValue={product.marketReferencePrice ?? product.sellingPricePerLitre} min="0" name={`market-${product.id}`} step="0.01" type="number" /><span className="unit">₹/L</span></span></label></article>)}
      </section>
      <PumpDeck pumps={pumps} staff={staff} previousReadings={previousReadings} />
      <TankDeck mode="opening" tanks={tanks} />
      <div className="daily-sticky-action"><span><strong>{stations.length} nozzles · {pumps.flatMap((pump) => pump.sides).length} staff positions</strong><small>Opening values and prices are snapshotted for today.</small></span><button className="button primary" disabled={saving || !staff.length} type="submit"><Play size={16} />{saving ? "Starting…" : "Start business day"}</button></div>
    </form> : !closed ? <form id="daily-closing-form" onSubmit={review}>
      <section className="daily-price-deck compact">{products.map((product) => <article className="price-ticket" key={product.id}><div><span className="fuel-dot" /><strong>{product.name}</strong><small>Locked daily rate</small></div><strong className="price-hero">₹{stations.find((station) => station.productId === product.id)?.pricePerLitre ?? product.sellingPricePerLitre}/L</strong></article>)}</section>
      <PumpClosingDeck pumps={pumps} activeShift={activeShift} closingReadings={closingReadings} setClosingReadings={setClosingReadings} litres={litres} />
      <TankDeck mode="closing" tanks={tanks} openingStocks={activeShift.openingTankStocks} />
      <label className="field variance-note"><span>Variance explanation</span><textarea name="varianceExplanation" placeholder="Explain any payment, cash or physical tank difference before closing." /></label>
      {preview ? <ReconciliationPreview preview={preview} /> : null}
      <div className="daily-sticky-action"><span><strong>{preview ? `${inr(preview.sales.expectedSales)} expected · ${inr(preview.sales.accountedTender)} entered` : "Enter all closing readings and collections"}</strong><small>{preview ? `${inr(preview.sales.tenderVariance)} tender variance` : "Review runs the canonical server calculation."}</small></span><div className="form-actions"><button className="button" disabled={saving} type="submit"><Calculator size={16} />{saving ? "Calculating…" : "Review closing"}</button><button className="button primary" disabled={saving || !preview} onClick={closeDay} type="button"><LockKeyhole size={16} />Close day &amp; update tanks</button></div></div>
    </form> : null}
  </div>;
}

function PumpDeck({ pumps, staff, previousReadings }: { pumps: Pump[]; staff: Staff[]; previousReadings: Record<string, string> }) {
  return <section className="pump-deck">{pumps.map((pump) => <article className="pump-card" key={pump.code}><header><span className="pump-emblem"><Fuel size={20} /></span><span><small>Multi-product dispenser</small><strong>Pump {pump.code}</strong></span><Gauge size={22} /></header><div className="pump-sides">{pump.sides.map((side) => <section className="pump-side" key={side.id}><div className="side-owner"><span><small>{side.label}</small><strong>{side.stations.map((station) => station.code).join(" + ")}</strong></span><label><UserRound size={15} /><select aria-label={`Pump ${pump.code} ${side.label} operator`} name={`staff-${side.id}`} required><option value="">Choose operator</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label></div><div className="nozzle-list">{side.stations.map((station) => <label className="nozzle-entry" key={station.stationId}><span className={`nozzle-badge ${station.productId}`}><Fuel size={14} />N{station.nozzleNumber ?? station.code}</span><span><strong>{station.productName}</strong><small>Previous close {previousReadings[station.stationId] || "Not recorded"}</small></span><span className="input-wrap"><input defaultValue={previousReadings[station.stationId] ?? ""} min="0" name={`opening-${station.stationId}`} placeholder="Opening" required step="0.001" type="number" /><span className="unit">L</span></span></label>)}</div></section>)}</div></article>)}</section>;
}

function PumpClosingDeck({ pumps, activeShift, closingReadings, setClosingReadings, litres }: { pumps: Pump[]; activeShift: ActiveShift; closingReadings: Record<string, string>; setClosingReadings: (value: Record<string, string>) => void; litres: (station: Station) => number }) {
  return <section className="pump-deck">{pumps.map((pump) => <article className="pump-card closing" key={pump.code}><header><span className="pump-emblem"><Fuel size={20} /></span><span><small>Closing workspace</small><strong>Pump {pump.code}</strong></span><Gauge size={22} /></header><div className="pump-sides">{pump.sides.map((side) => <section className="pump-side" key={side.id}><div className="side-owner"><span><small>{side.label}</small><strong>{side.assignment?.staffName ?? "Operator"}</strong></span><span className="side-live"><strong>{side.stations.reduce((sum, station) => sum + litres(station), 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })} L</strong><small>metered live</small></span></div><div className="nozzle-list">{side.stations.map((station) => <div className="nozzle-closing" key={station.stationId}><span className={`nozzle-badge ${station.productId}`}><Fuel size={14} />N{station.nozzleNumber ?? station.code}</span><span className="nozzle-reading"><small>Opening</small><strong>{activeShift.openingNozzleReadings[station.stationId]} L</strong></span><label><span>Closing</span><span className="input-wrap"><input min={activeShift.openingNozzleReadings[station.stationId]} name={`closing-${station.stationId}`} onChange={(event) => setClosingReadings({ ...closingReadings, [station.stationId]: event.target.value })} required step="0.001" type="number" value={closingReadings[station.stationId] ?? ""} /><span className="unit">L</span></span></label><label><span>Test fuel</span><span className="input-wrap"><input defaultValue="0" min="0" name={`test-${station.stationId}`} step="0.001" type="number" /><span className="unit">L</span></span></label><label className="returned-check"><input name={`returned-${station.stationId}`} type="checkbox" />Returned</label></div>)}</div><SideCollections side={side} /></section>)}</div></article>)}</section>;
}

function SideCollections({ side }: { side: Side }) {
  const fields = [["cash", "Cash"], ["upi", "UPI"], ["card", "Card"], ["credit", "Credit"], ["other", "Other"], ["handover", "Cash handed over"]];
  return <div className="side-collections"><div><IndianRupee size={16} /><span><strong>Collections</strong><small>{side.assignment?.staffName ?? "Operator"} · {side.label}</small></span></div><div className="collection-grid">{fields.map(([key, label]) => <label key={key}><span>{label}</span><span className="input-wrap"><input defaultValue="0" min="0" name={`${key}-${side.id}`} step="0.01" type="number" /><span className="unit">₹</span></span></label>)}</div></div>;
}

function TankDeck({ tanks, mode, openingStocks = {} }: { tanks: Tank[]; mode: "opening" | "closing"; openingStocks?: Record<string, string> }) {
  return <section className="tank-ribbon"><div><Fuel size={20} /><span><small>Connected inventory</small><strong>{mode === "opening" ? "Confirm opening tank stock" : "Enter physical closing stock"}</strong></span></div>{tanks.map((tank) => <label key={tank.tankId}><span><strong>{tank.name}</strong><small>{mode === "closing" ? `Opening ${openingStocks[tank.tankId]} L` : tank.productName}</small></span><span className="input-wrap"><input defaultValue={mode === "opening" ? tank.currentStock : openingStocks[tank.tankId]} min="0" name={`tank-${mode}-${tank.tankId}`} required step="0.001" type="number" /><span className="unit">L</span></span></label>)}</section>;
}

function ReconciliationPreview({ preview }: { preview: ShiftReconciliation }) {
  return <section className="daily-reconciliation"><header><span><small>Server-calculated preview</small><strong>{inr(preview.sales.expectedSales)} expected sales</strong></span><span className={preview.sales.tenderVariance === "0.00" ? "status-pill healthy" : "status-pill warning"}>{preview.sales.tenderVariance === "0.00" ? "Tallied" : `${inr(preview.sales.tenderVariance)} variance`}</span></header><div className="side-result-grid">{preview.sides?.map((side) => <article key={side.sideId}><span><small>Pump {side.dispenserCode} · {side.sideLabel}</small><strong>{side.staffName}</strong></span><dl><div><dt>Litres</dt><dd>{side.litresSold} L</dd></div><div><dt>Expected</dt><dd>{inr(side.expectedSalesValue)}</dd></div><div><dt>Entered</dt><dd>{inr(side.accountedTender)}</dd></div><div><dt>Variance</dt><dd className={side.tenderVariance === "0.00" ? "balanced" : "unbalanced"}>{inr(side.tenderVariance)}</dd></div></dl></article>)}</div><div className="product-result-row">{preview.products?.map((product) => <span key={product.productId}><small>{product.productName}</small><strong>{product.litresSold} L · {inr(product.revenue)}</strong></span>)}</div></section>;
}
