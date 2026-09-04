"use client";

import { Calculator, CheckCircle2, Fuel, Gauge, IndianRupee, LockKeyhole, PencilLine, Play, Plus, Save } from "lucide-react";
import Link from "next/link";
import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { PumpShiftRecord, ShiftReconciliation } from "@/server/domain/operations";
import { pumpGroupId } from "@/server/domain/pump-grouping";

function readDraft<T>(key: string): Partial<T> | undefined {
  if (typeof window === "undefined") return undefined;
  try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) as Partial<T> : undefined; }
  catch { return undefined; }
}

function writeDraft(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

function clearDraft(key: string) {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

type Rates = Record<string, { cost: string; selling: string }>;
type OpeningDraft = { businessDate: string; operatorIds: Record<string, string>; openingReadings: Record<string, string>; openingTankStocks: Record<string, string>; rates: Rates };
type PumpShiftTimes = Record<string, { start: string; end: string }>;
type ClosingDraft = {
  operatorIds: Record<string, string>; openingReadings: Record<string, string>; closingReadings: Record<string, string>;
  collections: Record<string, Record<string, string>>; testFuel: Record<string, string>; testFuelReturned: Record<string, boolean>;
  closingTankStocks: Record<string, string>; rates: Rates; activeCorrectionReason: string; varianceExplanation: string;
  pumpShiftTimes: PumpShiftTimes;
};
type Product = { id: string; code: string; name: string; sellingPricePerLitre: string; costPricePerLitre: string; marketReferencePrice?: string };
type Staff = { id: string; name: string; monthlySalary: string; dailyBeta?: string; assignedShift?: "SHIFT_1" | "SHIFT_2" };
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
  pumpShiftHistory?: PumpShiftRecord[];
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

type Pump = { id: string; code: string; stations: Station[]; assignment?: Assignment };

function layout(stations: Station[], assignments: Assignment[] = []): Pump[] {
  const pumps = new Map<string, Pump>();
  for (const station of [...stations].sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999) || a.code.localeCompare(b.code))) {
    const id = pumpGroupId(station, station.stationId);
    const pump = pumps.get(id) ?? {
      id, code: station.dispenserCode ?? station.code.split("-")[0] ?? "Pump", stations: [],
      assignment: assignments.find((item) => item.nozzleId === station.stationId)
    };
    pump.stations.push(station); pumps.set(id, pump);
  }
  return [...pumps.values()].sort((a, b) => a.code.localeCompare(b.code));
}


function number(value: string | null | undefined) {
  return String(value ?? "0") || "0";
}

function inr(value: string | undefined) {
  return `₹${Number(value ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function varianceLabel(value: string | number | undefined) {
  const amount = Number(value ?? 0);
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${sign}₹${Math.abs(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nozzleLabel(station: Station) {
  return station.nozzleNumber == null ? station.code : station.productName || `N${station.nozzleNumber}`;
}

type FuelGroup = { productId: string; productName: string; litres: number; revenue: number; profit: number };

function fuelGroups(stations: Station[], litres: (station: Station) => number, revenue: (station: Station) => number, profit: (station: Station) => number): FuelGroup[] {
  const groups = new Map<string, FuelGroup>();
  for (const station of stations) {
    const group = groups.get(station.productId) ?? { productId: station.productId, productName: station.productName, litres: 0, revenue: 0, profit: 0 };
    group.litres += litres(station); group.revenue += revenue(station); group.profit += profit(station);
    groups.set(station.productId, group);
  }
  return [...groups.values()];
}

function staffOption(person: Staff) {
  return `${person.name} · ${person.assignedShift === "SHIFT_2" ? "Shift 2" : "Shift 1"}`;
}

export function DailyForecourtSheet({ businessDate, products, staff, stations, tanks, previousReadings, previousReadingSources = {}, activeShift, attendance }: Props) {
  const router = useRouter();
  const pumps = useMemo(() => layout(stations, activeShift?.staffAssignments), [stations, activeShift]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ShiftReconciliation>();
  const [closedRecord, setClosedRecord] = useState<{ id: string; reconciliation: ShiftReconciliation }>();
  const initialOpenings = Object.fromEntries(stations.map((station) => [station.stationId, activeShift?.openingNozzleReadings[station.stationId] ?? previousReadings[station.stationId] ?? ""]));
  const [pumpShiftHistory, setPumpShiftHistory] = useState<PumpShiftRecord[]>(activeShift?.pumpShiftHistory ?? []);
  const seededOpenings = Object.fromEntries(stations.map((station) => {
    const entriesForStation = pumpShiftHistory.filter((entry) => entry.closingNozzleReadings[station.stationId] !== undefined);
    const last = entriesForStation[entriesForStation.length - 1];
    return [station.stationId, last ? last.closingNozzleReadings[station.stationId] : initialOpenings[station.stationId]];
  }));
  const [openingReadings, setOpeningReadings] = useState<Record<string, string>>(seededOpenings);
  const [closingReadings, setClosingReadings] = useState<Record<string, string>>({ ...seededOpenings });
  const [operatorIds, setOperatorIds] = useState<Record<string, string>>(Object.fromEntries(pumps.map((pump) => [pump.id, pump.assignment?.staffId ?? ""])));
  const [collections, setCollections] = useState<Record<string, Record<string, string>>>({});
  const [testFuel, setTestFuel] = useState<Record<string, string>>({});
  const [testFuelReturned, setTestFuelReturned] = useState<Record<string, boolean>>(Object.fromEntries(stations.map((station) => [station.stationId, true])));
  const [pumpShiftTimes, setPumpShiftTimes] = useState<PumpShiftTimes>({});
  const [pumpSaving, setPumpSaving] = useState<Record<string, boolean>>({});
  const [pumpSavedAt, setPumpSavedAt] = useState<Record<string, Date>>({});
  const [rates, setRates] = useState<Rates>(Object.fromEntries(products.map((product) => { const snapshot = stations.find((station) => station.productId === product.id); return [product.id, { cost: activeShift ? snapshot?.costPerLitre ?? product.costPricePerLitre : product.costPricePerLitre, selling: activeShift ? snapshot?.pricePerLitre ?? product.sellingPricePerLitre : product.sellingPricePerLitre }]; })));
  const [businessDateDraft, setBusinessDateDraft] = useState(businessDate);
  const [openingTankStocks, setOpeningTankStocks] = useState<Record<string, string>>(Object.fromEntries(tanks.map((tank) => [tank.tankId, tank.currentStock])));
  const [closingTankStocks, setClosingTankStocks] = useState<Record<string, string>>(Object.fromEntries(tanks.map((tank) => [tank.tankId, activeShift?.openingTankStocks[tank.tankId] ?? ""])));
  const [activeCorrectionReason, setActiveCorrectionReason] = useState("");
  const [varianceExplanation, setVarianceExplanation] = useState("");
  const [draftSavedAt, setDraftSavedAt] = useState<Date>();
  const closeKey = useRef<string | undefined>(undefined);
  const openingDraftKey = `forecourt-draft:opening:${businessDate}`;
  const closingDraftKey = activeShift ? `forecourt-draft:closing:${activeShift.id}` : undefined;
  const hydratedDraftKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    const key = activeShift ? closingDraftKey : openingDraftKey;
    if (!key || hydratedDraftKey.current === key) return;
    hydratedDraftKey.current = key;
    if (activeShift) {
      const draft = readDraft<ClosingDraft>(key); if (!draft) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring saved state from localStorage, an external system
      if (draft.operatorIds) setOperatorIds(draft.operatorIds);
      if (draft.openingReadings) setOpeningReadings(draft.openingReadings);
      if (draft.closingReadings) setClosingReadings(draft.closingReadings);
      if (draft.collections) setCollections(draft.collections);
      if (draft.testFuel) setTestFuel(draft.testFuel);
      if (draft.testFuelReturned) setTestFuelReturned((current) => ({ ...current, ...draft.testFuelReturned }));
      if (draft.closingTankStocks) setClosingTankStocks(draft.closingTankStocks);
      if (draft.rates) setRates(draft.rates);
      if (draft.activeCorrectionReason) setActiveCorrectionReason(draft.activeCorrectionReason);
      if (draft.varianceExplanation) setVarianceExplanation(draft.varianceExplanation);
      if (draft.pumpShiftTimes) setPumpShiftTimes((current) => ({ ...current, ...draft.pumpShiftTimes }));
    } else {
      const draft = readDraft<OpeningDraft>(key); if (!draft) return;
      if (draft.businessDate) setBusinessDateDraft(draft.businessDate);
      if (draft.operatorIds) setOperatorIds(draft.operatorIds);
      if (draft.openingReadings) setOpeningReadings(draft.openingReadings);
      if (draft.openingTankStocks) setOpeningTankStocks(draft.openingTankStocks);
      if (draft.rates) setRates(draft.rates);
    }
  }, [activeShift, openingDraftKey, closingDraftKey]);

  useEffect(() => {
    if (activeShift) return;
    writeDraft(openingDraftKey, { businessDate: businessDateDraft, operatorIds, openingReadings, openingTankStocks, rates } satisfies OpeningDraft);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflects the write we just made to localStorage, an external system
    setDraftSavedAt(new Date());
  }, [activeShift, openingDraftKey, businessDateDraft, operatorIds, openingReadings, openingTankStocks, rates]);

  useEffect(() => {
    if (!activeShift || !closingDraftKey) return;
    writeDraft(closingDraftKey, { operatorIds, openingReadings, closingReadings, collections, testFuel, testFuelReturned, closingTankStocks, rates, activeCorrectionReason, varianceExplanation, pumpShiftTimes } satisfies ClosingDraft);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflects the write we just made to localStorage, an external system
    setDraftSavedAt(new Date());
  }, [activeShift, closingDraftKey, operatorIds, openingReadings, closingReadings, collections, testFuel, testFuelReturned, closingTankStocks, rates, activeCorrectionReason, varianceExplanation, pumpShiftTimes]);

  async function openDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await Promise.all(products.map(async (product) => {
        const sellingPrice = rates[product.id].selling;
        const response = await fetch(`/api/products/${product.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sellingPricePerLitre: sellingPrice, costPricePerLitre: rates[product.id].cost, marketReferencePrice: sellingPrice })
        });
        const body = await response.json(); if (!response.ok) throw new Error(body.error ?? `Could not update ${product.name} price`);
      }));
      const assignments = pumps.flatMap((pump) => {
        const staffId = operatorIds[pump.id] ?? "";
        const person = staff.find((item) => item.id === staffId);
        return pump.stations.map((station) => ({ staffId, staffName: person?.name ?? "", nozzleId: station.stationId }));
      });
      const response = await fetch("/api/shifts", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          name: "Daily forecourt sheet", businessDate: businessDateDraft,
          staffOnDuty: [...new Set(assignments.map((item) => item.staffName))], staffAssignments: assignments,
          openingNozzleReadings: Object.fromEntries(stations.map((station) => [station.stationId, number(openingReadings[station.stationId])])),
          openingTankStocks: Object.fromEntries(tanks.map((tank) => [tank.tankId, number(openingTankStocks[tank.tankId])])),
          stationOverrides: Object.fromEntries(stations.map((station) => [station.stationId, { productId: station.productId, tankId: station.tankId }]))
        })
      });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not start the business day");
      clearDraft(openingDraftKey);
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not start the business day"); }
    finally { setSaving(false); }
  }

  function closePayload() {
    const sideCollections = Object.fromEntries(pumps.map((pump) => {
      const values = collections[pump.id] ?? {};
      return [pump.id, {
        cash: number(values.cash), upi: number(values.upi), card: number(values.card),
        credit: number(values.credit), other: number(values.other), declaredCashHandover: number(values.handover)
      }];
    }));
    const sum = (key: keyof (typeof sideCollections)[string]) => Decimal.sum(0, ...Object.values(sideCollections).map((item) => item[key])).toDecimalPlaces(2).toFixed(2);
    const staffHandovers: Record<string, string> = {};
    for (const pump of pumps) {
      const staffId = operatorIds[pump.id] ?? pump.assignment?.staffId;
      if (!staffId) continue;
      const collection = sideCollections[pump.id];
      const total = Decimal.sum(collection.cash, collection.upi, collection.card, collection.credit, collection.other);
      staffHandovers[staffId] = new Decimal(staffHandovers[staffId] ?? 0).plus(total).toDecimalPlaces(2).toFixed(2);
    }
    return {
      closingNozzleReadings: Object.fromEntries(stations.map((station) => [station.stationId, number(closingReadings[station.stationId])])),
      closingTankStocks: Object.fromEntries(tanks.map((tank) => [tank.tankId, number(closingTankStocks[tank.tankId])])),
      nonSaleDispenses: stations.map((station) => ({ nozzleId: station.stationId, volume: number(testFuel[station.stationId]), returnedToTank: testFuelReturned[station.stationId] === true })).filter((entry) => Number(entry.volume) > 0),
      receipts: Object.fromEntries(tanks.map((tank) => [tank.tankId, "0"])), sideCollections, staffHandovers,
      payments: { cashSales: sum("cash"), upi: sum("upi"), card: sum("card"), credit: sum("credit"), other: sum("other"), cashReceipts: "0", cashExpenses: "0", cashRemovals: "0", declaredCashHandover: sum("declaredCashHandover") },
      lubricantRevenue: "0", lubricantCost: "0", expenses: "0", varianceExplanation
    };
  }

  async function persistActiveSetup() {
    if (!activeShift) return;
    const assignments = pumps.flatMap((pump) => { const staffId = operatorIds[pump.id] ?? ""; const staffName = staff.find((person) => person.id === staffId)?.name ?? ""; return pump.stations.map((station) => ({ staffId, staffName, nozzleId: station.stationId })); });
    const response = await fetch(`/api/shifts/${activeShift.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ openingNozzleReadings: openingReadings, staffAssignments: assignments, productRates: Object.fromEntries(products.map((product) => [product.id, { sellingPricePerLitre: rates[product.id].selling, costPricePerLitre: rates[product.id].cost }])), reason: activeCorrectionReason }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not save today's setup");
  }

  async function saveActiveSetup() {
    setSaving(true); setError("");
    try { await persistActiveSetup(); setPreview(undefined); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save today's setup"); }
    finally { setSaving(false); }
  }

  async function completePumpShift(pump: Pump) {
    if (!activeShift) return;
    const staffId = operatorIds[pump.id] ?? "";
    const person = staff.find((item) => item.id === staffId);
    if (!staffId || !person) { setError(`Select an employee for Pump ${pump.code} before completing the shift.`); return; }
    setPumpSaving((current) => ({ ...current, [pump.id]: true })); setError("");
    try {
      const pumpCollections = collections[pump.id];
      const closingForPump = Object.fromEntries(pump.stations.map((station) => [station.stationId, number(closingReadings[station.stationId])]));
      const response = await fetch(`/api/shifts/${activeShift.id}/pumps/${pump.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId, staffName: person.name,
          shiftStartTime: pumpShiftTimes[pump.id]?.start || undefined,
          shiftEndTime: pumpShiftTimes[pump.id]?.end || undefined,
          closingNozzleReadings: closingForPump,
          nonSaleDispenses: pump.stations.map((station) => ({ nozzleId: station.stationId, volume: number(testFuel[station.stationId]), returnedToTank: testFuelReturned[station.stationId] === true })).filter((entry) => Number(entry.volume) > 0),
          collections: pumpCollections ? {
            cash: number(pumpCollections.cash), upi: number(pumpCollections.upi), card: number(pumpCollections.card),
            credit: number(pumpCollections.credit), other: number(pumpCollections.other), declaredCashHandover: number(pumpCollections.handover)
          } : undefined
        })
      });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? `Could not complete Pump ${pump.code}'s shift`);
      setPumpShiftHistory(body.pumpShiftHistory ?? []);
      setOpeningReadings((current) => ({ ...current, ...closingForPump }));
      setClosingReadings((current) => ({ ...current, ...closingForPump }));
      setOperatorIds((current) => ({ ...current, [pump.id]: "" }));
      setPumpShiftTimes((current) => ({ ...current, [pump.id]: { start: "", end: "" } }));
      setCollections((current) => { const next = { ...current }; delete next[pump.id]; return next; });
      setTestFuel((current) => { const next = { ...current }; for (const station of pump.stations) delete next[station.stationId]; return next; });
      setTestFuelReturned((current) => ({ ...current, ...Object.fromEntries(pump.stations.map((station) => [station.stationId, true])) }));
      setPumpSavedAt((current) => ({ ...current, [pump.id]: new Date() }));
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : `Could not complete Pump ${pump.code}'s shift`); }
    finally { setPumpSaving((current) => ({ ...current, [pump.id]: false })); }
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!activeShift) return; setSaving(true); setError("");
    try {
      await persistActiveSetup();
      const response = await fetch(`/api/shifts/${activeShift.id}/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(closePayload()) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not calculate the reconciliation"); setPreview(body);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not calculate the reconciliation"); }
    finally { setSaving(false); }
  }

  async function closeDay() {
    if (!activeShift || !preview) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/shifts/${activeShift.id}/close`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": closeKey.current ??= crypto.randomUUID() }, body: JSON.stringify(closePayload()) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not close the business day"); setClosedRecord(body); if (closingDraftKey) clearDraft(closingDraftKey); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not close the business day"); }
    finally { setSaving(false); }
  }

  const liveMeteredLitres = (station: Station) => Math.max(0, Number(closingReadings[station.stationId] ?? 0) - Number(openingReadings[station.stationId] ?? 0));
  const stationTestFuel = (station: Station) => Number(testFuel[station.stationId] ?? 0);
  const liveLitres = (station: Station) => Math.max(0, liveMeteredLitres(station) - stationTestFuel(station));
  const liveRevenue = (station: Station) => liveLitres(station) * Number(rates[station.productId]?.selling ?? station.pricePerLitre);
  const liveProfit = (station: Station) => liveLitres(station) * (Number(rates[station.productId]?.selling ?? station.pricePerLitre) - Number(rates[station.productId]?.cost ?? station.costPerLitre));
  const stationTestFuelValue = (station: Station) => stationTestFuel(station) * Number(rates[station.productId]?.selling ?? station.pricePerLitre);
  const meteredLitres = liveMeteredLitres;
  const litres = liveLitres;
  const stationRevenue = liveRevenue;
  const stationProfit = liveProfit;
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

    {!activeShift ? <><section className="today-setup-strip"><label className="field"><span>Business date</span><input form="daily-opening-form" value={businessDateDraft} onChange={(event) => setBusinessDateDraft(event.target.value)} name="businessDate" type="date" required /></label><form className="inline-operator-form" onSubmit={addOperator}><label><span>Add operator without leaving Today</span><input name="name" placeholder="Operator name" required /></label><button className="button soft" disabled={saving}><Plus size={14} />Add</button></form><div className="attendance-chips">{attendance.map((record) => <span className={`attendance-chip ${record.status.toLowerCase()}`} key={record.staffId}>{record.staffName} · {record.status}</span>)}</div></section><form id="daily-opening-form" onSubmit={openDay}>
      <section className="daily-rate-board"><header><span><small>Step 1 · Set today&apos;s rates</small><strong>Dealer cost &amp; customer price</strong></span><p>These values are locked into today&apos;s sales record and will not change historical profit.</p></header><div className="daily-price-deck">
        {products.map((product) => <article className={`price-ticket ${product.id}`} key={product.id}><div className="price-product"><span className="fuel-dot" /><span><small>Fuel grade</small><strong>{product.name}</strong><small>Margin preview: {inr(String(Number(rates[product.id]?.selling ?? 0) - Number(rates[product.id]?.cost ?? 0)))} / L</small></span></div><label className="rate-field"><span><small>What the outlet pays</small><strong>Reseller purchase price</strong></span><span className="money-control"><b>₹</b><input aria-label={`${product.name} reseller purchase price`} value={rates[product.id]?.cost} onChange={(event) => setRates({ ...rates, [product.id]: { ...rates[product.id], cost: event.target.value } })} min="0" name={`cost-${product.id}`} required step="0.01" type="number" /><em>per litre</em></span></label><label className="rate-field customer"><span><small>Official price charged to customer</small><strong>Market/customer selling price</strong></span><span className="money-control"><b>₹</b><input aria-label={`${product.name} customer selling price`} value={rates[product.id]?.selling} onChange={(event) => setRates({ ...rates, [product.id]: { ...rates[product.id], selling: event.target.value } })} min="0" name={`selling-${product.id}`} required step="0.01" type="number" /><em>per litre</em></span></label></article>)}
      </div></section>
      <PumpDeck pumps={pumps} staff={staff} operatorIds={operatorIds} setOperatorIds={setOperatorIds} openingReadings={openingReadings} setOpeningReadings={setOpeningReadings} previousReadingSources={previousReadingSources} />
      <TankDeck mode="opening" tanks={tanks} values={openingTankStocks} onChange={setOpeningTankStocks} />
      <div className="daily-sticky-action"><span><strong>{stations.length} nozzles · {pumps.length} staff positions</strong><small>Opening values and prices are snapshotted for today.</small></span>{draftSavedAt ? <span className="draft-saved-indicator"><Save size={14} />Draft saved {draftSavedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span> : null}<button className="button primary" disabled={saving || !staff.length} type="submit"><Play size={16} />{saving ? "Starting…" : "Start business day"}</button></div>
    </form></> : !closedRecord ? <form id="daily-closing-form" onSubmit={review}>
      <section className="active-day-console"><div className="active-day-heading"><span><small>Open day control centre</small><strong>Rates, openings and employees remain correctable until close</strong></span><span className="payroll-commitment"><small>Salary commitment</small><strong>{inr(String(monthlyPayroll))}</strong><em>monthly payroll</em></span></div><div className="active-rate-grid">{products.map((product) => <article key={product.id}><span className={`fuel-chip ${product.id}`}>{product.name}</span><label><span>Reseller purchase</span><span className="input-wrap"><input aria-label={`${product.name} active reseller purchase price`} min="0" onChange={(event) => setRates({ ...rates, [product.id]: { ...rates[product.id], cost: event.target.value } })} step="0.01" type="number" value={rates[product.id]?.cost ?? ""} /><span className="unit">₹</span></span></label><label><span>Customer selling</span><span className="input-wrap"><input aria-label={`${product.name} active customer selling price`} min="0" onChange={(event) => setRates({ ...rates, [product.id]: { ...rates[product.id], selling: event.target.value } })} step="0.01" type="number" value={rates[product.id]?.selling ?? ""} /><span className="unit">₹</span></span></label><span className="rate-margin"><small>Margin / L</small><strong>{inr(String(Number(rates[product.id]?.selling || 0) - Number(rates[product.id]?.cost || 0)))}</strong></span></article>)}</div></section>
      <PumpClosingDeck pumps={pumps} staff={staff} openingReadings={openingReadings} setOpeningReadings={setOpeningReadings} operatorIds={operatorIds} setOperatorIds={setOperatorIds} closingReadings={closingReadings} setClosingReadings={setClosingReadings} litres={litres} meteredLitres={meteredLitres} revenue={stationRevenue} profit={stationProfit} liveRevenue={liveRevenue} testFuel={testFuel} setTestFuel={setTestFuel} testFuelValue={stationTestFuelValue} collections={collections} setCollections={setCollections} pumpShiftTimes={pumpShiftTimes} setPumpShiftTimes={setPumpShiftTimes} completePumpShift={completePumpShift} pumpSaving={pumpSaving} pumpSavedAt={pumpSavedAt} />
      <TankDeck mode="closing" tanks={tanks} openingStocks={activeShift.openingTankStocks} values={closingTankStocks} onChange={setClosingTankStocks} />
      <label className="field active-correction-reason"><span>Reason for an opening, employee or rate correction</span><input name="activeCorrectionReason" onChange={(event) => setActiveCorrectionReason(event.target.value)} placeholder="Optional unless correcting the morning sheet" value={activeCorrectionReason} /></label>
      <label className="field variance-note"><span>Variance explanation</span><textarea name="varianceExplanation" onChange={(event) => setVarianceExplanation(event.target.value)} placeholder="Explain any payment, cash or physical tank difference before closing." value={varianceExplanation} /></label>
      {preview ? <ReconciliationPreview preview={preview} /> : null}
      <div className="daily-sticky-action"><span><strong>{preview ? `${inr(preview.sales.expectedSales)} expected · ${inr(preview.sales.accountedTender)} entered` : "Keep setup and closing on this page"}</strong>{preview ? <strong className={`variance-callout ${Number(preview.sales.tenderVariance) < 0 ? "unbalanced" : "balanced"}`}>{varianceLabel(preview.sales.tenderVariance)} tender variance</strong> : <small>Save setup changes, then review the canonical server calculation.</small>}</span>{draftSavedAt ? <span className="draft-saved-indicator"><Save size={14} />Draft saved {draftSavedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span> : null}<div className="form-actions"><button className="button soft" disabled={saving} onClick={saveActiveSetup} type="button"><PencilLine size={15} />Save setup changes</button><button className="button" disabled={saving} type="submit"><Calculator size={16} />{saving ? "Calculating…" : "Review closing"}</button><button className="button primary" disabled={saving || !preview} onClick={closeDay} type="button"><LockKeyhole size={16} />Close day &amp; update tanks</button></div></div>
    </form> : null}
  </div>;
}

function PumpDeck({ pumps, staff, operatorIds, setOperatorIds, openingReadings, setOpeningReadings, previousReadingSources }: { pumps: Pump[]; staff: Staff[]; operatorIds: Record<string, string>; setOperatorIds: (value: Record<string, string>) => void; openingReadings: Record<string, string>; setOpeningReadings: (value: Record<string, string>) => void; previousReadingSources: Record<string, { shiftId: string; businessDate: string }> }) {
  return <><div className="section-step"><span>2</span><div><small>Staff &amp; meter setup</small><strong>Confirm each pump&apos;s employee and opening totalizers</strong></div></div><p className="nozzle-map-note">Permanent fuel map: every pump runs two petrol and two diesel nozzles, worked by one employee.</p><section className="pump-deck opening-grid">{pumps.map((pump) => <article className="pump-card" key={pump.id}><header><span className="pump-emblem"><Fuel size={20} /></span><span><small>Opening setup</small><strong>Pump {pump.code}</strong></span><Gauge size={22} /></header><div className="pump-operator"><label><span>Employee on this pump</span><select aria-label={`Pump ${pump.code} operator`} name={`staff-${pump.id}`} onChange={(event) => setOperatorIds({ ...operatorIds, [pump.id]: event.target.value })} required value={operatorIds[pump.id] ?? ""}><option value="">Select employee</option>{staff.map((person) => <option key={person.id} value={person.id}>{staffOption(person)}</option>)}</select></label></div><div className="nozzle-list">{pump.stations.map((station) => <div className="nozzle-entry opening-row" key={station.stationId}><span className={`nozzle-badge ${station.productId}`}><Fuel size={14} />{nozzleLabel(station)}</span><label className="totalizer-field"><span><PencilLine size={13} />Opening totalizer</span><span className="totalizer-control"><input aria-label={`${station.code} opening totalizer`} value={openingReadings[station.stationId] ?? ""} onChange={(event) => setOpeningReadings({ ...openingReadings, [station.stationId]: event.target.value })} min="0" name={`opening-${station.stationId}`} placeholder="Enter reading" required step="0.001" type="number" /><em>L</em></span><small>{previousReadingSources[station.stationId] ? `From ${previousReadingSources[station.stationId].businessDate} closing` : "First opening — enter manually"}</small></label></div>)}</div></article>)}</section></>;
}

function PumpClosingDeck({ pumps, staff, openingReadings, setOpeningReadings, operatorIds, setOperatorIds, closingReadings, setClosingReadings, litres, meteredLitres, revenue, profit, liveRevenue, testFuel, setTestFuel, testFuelValue, collections, setCollections, pumpShiftTimes, setPumpShiftTimes, completePumpShift, pumpSaving, pumpSavedAt }: { pumps: Pump[]; staff: Staff[]; openingReadings: Record<string, string>; setOpeningReadings: (value: Record<string, string>) => void; operatorIds: Record<string, string>; setOperatorIds: (value: Record<string, string>) => void; closingReadings: Record<string, string>; setClosingReadings: (value: Record<string, string>) => void; litres: (station: Station) => number; meteredLitres: (station: Station) => number; revenue: (station: Station) => number; profit: (station: Station) => number; liveRevenue: (station: Station) => number; testFuel: Record<string, string>; setTestFuel: (value: Record<string, string>) => void; testFuelValue: (station: Station) => number; collections: Record<string, Record<string, string>>; setCollections: (value: Record<string, Record<string, string>>) => void; pumpShiftTimes: PumpShiftTimes; setPumpShiftTimes: (value: PumpShiftTimes) => void; completePumpShift: (pump: Pump) => void; pumpSaving: Record<string, boolean>; pumpSavedAt: Record<string, Date> }) {
  return <section className="pump-deck compact-pump-deck">{pumps.map((pump) => { const expected = pump.stations.reduce((sum, station) => sum + liveRevenue(station), 0); const entered = Object.entries(collections[pump.id] ?? {}).filter(([key]) => key !== "handover").reduce((sum, [, value]) => sum + Number(value || 0), 0); const groups = fuelGroups(pump.stations, litres, revenue, profit); const pumpTotal = groups.reduce((sum, group) => ({ litres: sum.litres + group.litres, revenue: sum.revenue + group.revenue, profit: sum.profit + group.profit }), { litres: 0, revenue: 0, profit: 0 }); const testGroups = fuelGroups(pump.stations, (station) => Number(testFuel[station.stationId] ?? 0), testFuelValue, () => 0).filter((group) => group.litres > 0); return <article className="pump-card closing compact-pump" key={pump.id}><header><span className="pump-emblem"><Fuel size={20} /></span><span><small>Live nozzle ledger</small><strong>Pump {pump.code}</strong></span><span className="pump-total"><b>{pump.stations.reduce((sum, station) => sum + meteredLitres(station), 0).toFixed(3)} L</b><small>metered today</small></span></header><div className="pump-sides"><section className="pump-side"><div className="side-owner"><label className="pump-operator-field"><span>Employee on this pump</span><select aria-label={`Pump ${pump.code} active operator`} onChange={(event) => setOperatorIds({ ...operatorIds, [pump.id]: event.target.value })} required value={operatorIds[pump.id] ?? ""}><option value="">Select</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><span className="side-live"><strong>{pump.stations.reduce((sum, station) => sum + litres(station), 0).toFixed(3)} L</strong><small>{inr(String(expected))} expected</small></span></div><div className="nozzle-list compact-nozzle-list">{pump.stations.map((station) => { const opening = openingReadings[station.stationId] ?? ""; return <div className="nozzle-ledger-row" key={station.stationId}><div className="ledger-nozzle"><span className={`nozzle-badge ${station.productId}`}><Fuel size={14} />{nozzleLabel(station)}</span></div><label><span>Opening</span><span className="input-wrap"><input aria-label={`${station.code} editable opening totalizer`} min="0" onChange={(event) => { const next = event.target.value; const wasUnchanged = closingReadings[station.stationId] === opening; setOpeningReadings({ ...openingReadings, [station.stationId]: next }); if (wasUnchanged) setClosingReadings({ ...closingReadings, [station.stationId]: next }); }} required step="0.001" type="number" value={opening} /><span className="unit">L</span></span></label><label><span>Closing</span><span className="input-wrap"><input aria-label={`${station.code} closing totalizer`} min={opening || "0"} name={`closing-${station.stationId}`} onChange={(event) => setClosingReadings({ ...closingReadings, [station.stationId]: event.target.value })} required step="0.001" type="number" value={closingReadings[station.stationId] ?? ""} /><span className="unit">L</span></span></label><label className="test-fuel-field"><span>Test fuel</span><span className="input-wrap"><input aria-label={`${station.code} test fuel`} min="0" name={`test-${station.stationId}`} onChange={(event) => setTestFuel({ ...testFuel, [station.stationId]: event.target.value })} step="0.001" type="number" value={testFuel[station.stationId] ?? "0"} /><span className="unit">L</span></span></label><div className="ledger-result"><strong>{litres(station).toFixed(3)} L</strong><span>{inr(String(revenue(station)))}</span><small>{inr(String(profit(station)))} profit</small></div></div>; })}</div><div className="fuel-summary">{groups.map((group) => <div aria-label={`Pump ${pump.code} ${group.productId} total`} className={`fuel-summary-item ${group.productId}`} key={group.productId}><span className={`nozzle-badge ${group.productId}`}><Fuel size={14} />{group.productName}</span><strong>{group.litres.toFixed(3)} L</strong><span>{inr(String(group.revenue))}</span><small>{inr(String(group.profit))} profit</small></div>)}<div aria-label={`Pump ${pump.code} total sales`} className="fuel-summary-total"><span><small>Overall litre</small><strong>{pumpTotal.litres.toFixed(3)} L</strong></span><span><small>Overall sales</small><strong>{inr(String(pumpTotal.revenue))}</strong></span><span><small>Profit</small><strong>{inr(String(pumpTotal.profit))}</strong></span></div></div><PumpCollections pump={pump} expected={expected} entered={entered} testGroups={testGroups} values={collections[pump.id] ?? {}} onChange={(values) => setCollections({ ...collections, [pump.id]: values })} /><div className="pump-save-row"><label><span>Shift start</span><input aria-label={`Pump ${pump.code} shift start time`} onChange={(event) => setPumpShiftTimes({ ...pumpShiftTimes, [pump.id]: { start: event.target.value, end: pumpShiftTimes[pump.id]?.end ?? "" } })} type="time" value={pumpShiftTimes[pump.id]?.start ?? ""} /></label><label><span>Shift end</span><input aria-label={`Pump ${pump.code} shift end time`} onChange={(event) => setPumpShiftTimes({ ...pumpShiftTimes, [pump.id]: { start: pumpShiftTimes[pump.id]?.start ?? "", end: event.target.value } })} type="time" value={pumpShiftTimes[pump.id]?.end ?? ""} /></label><button className="button soft" disabled={pumpSaving[pump.id]} onClick={() => completePumpShift(pump)} type="button"><CheckCircle2 size={14} />{pumpSaving[pump.id] ? "Completing…" : `Complete Pump ${pump.code} shift`}</button>{pumpSavedAt[pump.id] ? <span className="pump-saved-indicator"><CheckCircle2 size={13} />Completed {pumpSavedAt[pump.id].toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span> : null}</div></section></div></article>; })}</section>;
}

function PumpCollections({ pump, expected, entered, testGroups, values, onChange }: { pump: Pump; expected: number; entered: number; testGroups: FuelGroup[]; values: Record<string, string>; onChange: (values: Record<string, string>) => void }) {
  const fields = [["cash", "Cash", "cash collected"], ["upi", "UPI", "UPI collected"], ["card", "Card", "card collected"], ["credit", "Credit", "credit collected"], ["other", "Other", "other collected"], ["handover", "Cash handed over", "cash handed over"]];
  const variance = entered - expected;
  return <div className="side-collections"><div><IndianRupee size={16} /><span><strong>Collections</strong><small>Pump {pump.code}</small></span><strong className="entered-callout">{inr(String(entered))} entered</strong><strong className={`variance-callout ${variance < 0 ? "unbalanced" : "balanced"}`}>{varianceLabel(variance)} variance</strong></div>{testGroups.length > 0 ? <div className="test-fuel-note"><small>Test fuel excluded from sales, taken from the readings above</small><div className="test-fuel-chips">{testGroups.map((group) => <span aria-label={`Pump ${pump.code} ${group.productId} test fuel`} className={`test-fuel-chip ${group.productId}`} key={group.productId}>{group.productName} {group.litres.toFixed(3)} L · {inr(String(group.revenue))}</span>)}</div></div> : null}<div className="collection-grid">{fields.map(([key, label, aria]) => <label key={key}><span>{label}</span><span className="input-wrap"><input aria-label={`Pump ${pump.code} ${aria}`} value={values[key] ?? "0"} onChange={(event) => onChange({ ...values, [key]: event.target.value })} min="0" name={`${key}-${pump.id}`} step="0.01" type="number" /><span className="unit">₹</span></span></label>)}</div></div>;
}

function TankDeck({ tanks, mode, openingStocks = {}, values, onChange }: { tanks: Tank[]; mode: "opening" | "closing"; openingStocks?: Record<string, string>; values: Record<string, string>; onChange: (value: Record<string, string>) => void }) {
  return <section className="tank-ribbon"><div><Fuel size={20} /><span><small>Connected inventory</small><strong>{mode === "opening" ? "Confirm opening tank stock" : "Enter physical closing stock"}</strong></span></div>{tanks.map((tank) => <label key={tank.tankId}><span><strong>{tank.name}</strong><small>{mode === "closing" ? `Opening ${openingStocks[tank.tankId]} L` : tank.productName}</small></span><span className="input-wrap"><input aria-label={`${tank.name} ${mode} stock`} value={values[tank.tankId] ?? ""} onChange={(event) => onChange({ ...values, [tank.tankId]: event.target.value })} min="0" name={`tank-${mode}-${tank.tankId}`} required step="0.001" type="number" /><span className="unit">L</span></span></label>)}</section>;
}

function ReconciliationPreview({ preview }: { preview: ShiftReconciliation }) {
  return <section className="daily-reconciliation"><header><span><small>Server-calculated preview</small><strong>{inr(preview.sales.expectedSales)} expected sales</strong><small>{inr(preview.sales.expectedCashHandover)} expected cash handover</small><strong className={`variance-callout ${Number(preview.sales.cashVariance) < 0 ? "unbalanced" : "balanced"}`}>{varianceLabel(preview.sales.cashVariance)} cash variance</strong></span><span className={preview.sales.tenderVariance === "0.00" ? "status-pill healthy" : "status-pill warning"}>{preview.sales.tenderVariance === "0.00" ? "Tallied" : `${varianceLabel(preview.sales.tenderVariance)} variance`}</span></header><div className="side-result-grid">{preview.sides?.map((side) => <article key={side.sideId}><span><small>{side.sideLabel}</small><strong>{side.staffName}</strong></span><dl><div><dt>Litres</dt><dd>{side.litresSold} L</dd></div><div><dt>Expected</dt><dd>{inr(side.expectedSalesValue)}</dd></div><div><dt>Entered</dt><dd>{inr(side.accountedTender)}</dd></div><div><dt>Variance</dt><dd className={Number(side.tenderVariance) < 0 ? "unbalanced" : "balanced"}>{varianceLabel(side.tenderVariance)}</dd></div></dl><div className="payment-result"><span>Cash {inr(side.cash)}</span><span>UPI {inr(side.upi)}</span><span>Card {inr(side.card)}</span><span>Credit {inr(side.credit)}</span><span>Other {inr(side.other)}</span><span>Handed over {inr(side.declaredCashHandover)}</span></div><div className="side-product-split">{(side.products ?? []).map((product) => <span key={product.productId}><b>{product.productName}</b>{product.litresSold} L · {inr(product.revenue)} · {inr(product.grossProfit)} profit</span>)}</div></article>)}</div><div className="product-result-row">{preview.products?.map((product) => <span key={product.productId}><small>{product.productName}</small><strong>{product.litresSold} L · {inr(product.revenue)}</strong></span>)}</div><div className="tank-result-grid">{Object.entries(preview.tanks).map(([tankId, tank]) => <article key={tankId}><small>{tankId.replaceAll("_", " ")}</small><strong>{tank.expectedClosingStock} L expected</strong><span>{tank.actualClosingStock} L physical · {tank.variance} L variance</span></article>)}</div><div className="employee-result-grid">{preview.staff?.map((person) => <article key={`${person.staffId}:${person.nozzleId}`}><strong>{person.staffName}</strong><span>{person.product} · {person.litresSold} L · {inr(person.expectedSalesValue)}</span><small>{person.machineLabel}</small></article>)}</div></section>;
}
