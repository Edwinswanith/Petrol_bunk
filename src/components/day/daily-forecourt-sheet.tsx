"use client";

import { ArrowRight, Calculator, CalendarClock, CheckCircle2, Fuel, Gauge, IndianRupee, LockKeyhole, PencilLine, Play, Plus, Save } from "lucide-react";
import Link from "next/link";
import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { PumpShiftRecord, ShiftReconciliation } from "@/server/domain/operations";
import { pumpGroupId } from "@/server/domain/pump-grouping";
import { TodaySavedPumpShifts } from "@/components/day/today-saved-pump-shifts";

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
type PumpAllocation = { id: string; pumpId: string; staffId: string; nozzleIds: string[] };
type OpeningDraft = { businessDate: string; allocations?: PumpAllocation[]; operatorIds?: Record<string, string>; openingReadings: Record<string, string>; openingTankStocks: Record<string, string>; rates: Rates };
type PumpShiftTimes = Record<string, { start: string; end: string }>;
type ClosingDraft = {
  closingReadings: Record<string, string>;
  collections: Record<string, Record<string, string>>; testFuel: Record<string, string>; testFuelReturned: Record<string, boolean>;
  closingTankStocks: Record<string, string>; activeCorrectionReason: string; varianceExplanation: string;
  pumpShiftTimes: PumpShiftTimes; allocations?: PumpAllocation[];
};
type Product = { id: string; code: string; name: string; sellingPricePerLitre: string; costPricePerLitre: string; marketReferencePrice?: string };
type Staff = { id: string; name: string; monthlySalary: string; dailyBeta?: string; assignedShift?: "SHIFT_1" | "SHIFT_2" };
type Station = {
  stationId: string; code: string; name: string; productId: string; productName: string; tankId: string; tankName: string;
  pricePerLitre: string; costPerLitre: string; marketReferencePrice?: string; dispenserId?: string; dispenserCode?: string;
  sideId?: string; sideLabel?: string; nozzleNumber?: number; displayOrder?: number;
};
type Tank = { tankId: string; productId: string; name: string; productName: string; currentStock: string };
type TankLevel = { tankId: string; name: string; productName: string; currentStock: string; capacityLitres: string; percentage: number; status: "critical" | "watch" | "healthy" };
type Attendance = { staffId: string; staffName: string; status: string };
type Assignment = { staffId: string; staffName: string; nozzleId: string };
type ActiveShift = {
  id: string; name: string; businessDate: string; startedAt: string; openingNozzleReadings: Record<string, string>;
  openingTankStocks: Record<string, string>; staffAssignments: Assignment[];
  pumpShiftHistory?: PumpShiftRecord[];
};

type Props = {
  businessDate: string;
  today?: string;
  products: Product[];
  staff: Staff[];
  stations: Station[];
  tanks: Tank[];
  tankLevels?: TankLevel[];
  missingBusinessDays?: string[];
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

function quantity(value: string | undefined) {
  return Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

function outletTime(value: string | Date, includeSeconds = false) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {})
  }).format(typeof value === "string" ? new Date(value) : value);
}

function varianceLabel(value: string | number | undefined) {
  const amount = Number(value ?? 0);
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${sign}₹${Math.abs(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function allocatedNozzleLabel(station: Station) {
  return station.nozzleNumber == null ? station.code : `${station.productName} N${station.nozzleNumber}`;
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

function defaultAllocations(pumps: Pump[], assignments: Assignment[] = []): PumpAllocation[] {
  return pumps.flatMap((pump) => {
    const grouped = new Map<string, string[]>();
    for (const station of pump.stations) {
      const assignment = assignments.find((item) => item.nozzleId === station.stationId);
      if (!assignment?.staffId) continue;
      grouped.set(assignment.staffId, [...(grouped.get(assignment.staffId) ?? []), station.stationId]);
    }
    const saved = [...grouped].slice(0, 2).map(([staffId, nozzleIds], index) => ({ id: `${pump.id}:employee-${index + 1}`, pumpId: pump.id, staffId, nozzleIds }));
    return saved.length ? saved : [{ id: `${pump.id}:employee-1`, pumpId: pump.id, staffId: "", nozzleIds: pump.stations.map((station) => station.stationId) }];
  });
}

function assignmentsFromAllocations(allocations: PumpAllocation[], staff: Staff[]): Assignment[] {
  return allocations.flatMap((allocation) => {
    const staffName = staff.find((person) => person.id === allocation.staffId)?.name ?? "";
    return allocation.nozzleIds.map((nozzleId) => ({ staffId: allocation.staffId, staffName, nozzleId }));
  });
}

function addPumpEmployee(allocations: PumpAllocation[], pump: Pump) {
  const current = allocations.filter((allocation) => allocation.pumpId === pump.id);
  if (current.length >= 2 || !current[0]) return allocations;
  const sorted = [...pump.stations].sort((a, b) => (a.nozzleNumber ?? 0) - (b.nozzleNumber ?? 0));
  const firstIds = sorted.filter((_, index) => index % 2 === 0).map((station) => station.stationId);
  const secondIds = sorted.filter((_, index) => index % 2 === 1).map((station) => station.stationId);
  return allocations
    .map((allocation) => allocation.id === current[0].id ? { ...allocation, nozzleIds: firstIds } : allocation)
    .concat({ id: `${pump.id}:employee-2`, pumpId: pump.id, staffId: "", nozzleIds: secondIds });
}

function removePumpEmployee(allocations: PumpAllocation[], pump: Pump) {
  const first = allocations.find((allocation) => allocation.pumpId === pump.id);
  return allocations
    .filter((allocation) => allocation.pumpId !== pump.id || allocation.id === first?.id)
    .map((allocation) => allocation.id === first?.id ? { ...allocation, nozzleIds: pump.stations.map((station) => station.stationId) } : allocation);
}

function movePumpNozzle(allocations: PumpAllocation[], pump: Pump, target: PumpAllocation, nozzleId: string) {
  const pumpAllocations = allocations.filter((allocation) => allocation.pumpId === pump.id);
  if (pumpAllocations.length !== 2) return allocations;
  const targetOwnsNozzle = target.nozzleIds.includes(nozzleId);
  return allocations.map((allocation) => {
    if (allocation.pumpId !== pump.id) return allocation;
    if (allocation.id === target.id) return { ...allocation, nozzleIds: targetOwnsNozzle ? allocation.nozzleIds.filter((id) => id !== nozzleId) : [...allocation.nozzleIds, nozzleId] };
    return { ...allocation, nozzleIds: targetOwnsNozzle ? [...allocation.nozzleIds, nozzleId] : allocation.nozzleIds.filter((id) => id !== nozzleId) };
  });
}

function validatePumpAllocations(pumps: Pump[], allocations: PumpAllocation[], requireEveryEmployee: boolean) {
  for (const pump of pumps) {
    const pumpAllocations = allocations.filter((allocation) => allocation.pumpId === pump.id);
    const assigned = pumpAllocations.flatMap((allocation) => allocation.nozzleIds);
    if ((requireEveryEmployee || pumpAllocations.length === 2) && pumpAllocations.some((allocation) => !allocation.staffId)) throw new Error(`Select every employee for Pump ${pump.code}.`);
    const selectedStaff = pumpAllocations.map((allocation) => allocation.staffId).filter(Boolean);
    if (new Set(selectedStaff).size !== selectedStaff.length) throw new Error(`Select different employees for Pump ${pump.code}.`);
    if (assigned.length !== pump.stations.length || new Set(assigned).size !== assigned.length) throw new Error(`Assign every nozzle on Pump ${pump.code} once.`);
    if (pumpAllocations.length === 2 && pumpAllocations.some((allocation) => allocation.nozzleIds.length !== 2)) throw new Error(`Each employee on Pump ${pump.code} must have two nozzles.`);
  }
}

function shiftDuration(start: string, end: string) {
  if (!start || !end) return 0;
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes < 0) minutes += 24 * 60;
  return minutes;
}

export function DailyForecourtSheet({ businessDate, today = businessDate, products, staff, stations, tanks, tankLevels = [], missingBusinessDays = [], previousReadings, previousReadingSources = {}, activeShift, attendance }: Props) {
  const router = useRouter();
  const pumps = useMemo(() => layout(stations, activeShift?.staffAssignments), [stations, activeShift]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ShiftReconciliation>();
  const [closedRecord, setClosedRecord] = useState<{ id: string; businessDate: string; reconciliation: ShiftReconciliation }>();
  const initialOpenings = Object.fromEntries(stations.map((station) => [station.stationId, activeShift?.openingNozzleReadings[station.stationId] ?? previousReadings[station.stationId] ?? ""]));
  const [pumpShiftHistory, setPumpShiftHistory] = useState<PumpShiftRecord[]>(activeShift?.pumpShiftHistory ?? []);
  const seededOpenings = Object.fromEntries(stations.map((station) => {
    const entriesForStation = pumpShiftHistory.filter((entry) => entry.closingNozzleReadings[station.stationId] !== undefined);
    const last = entriesForStation[entriesForStation.length - 1];
    return [station.stationId, last ? last.closingNozzleReadings[station.stationId] : initialOpenings[station.stationId]];
  }));
  const [openingReadings, setOpeningReadings] = useState<Record<string, string>>(seededOpenings);
  const [closingReadings, setClosingReadings] = useState<Record<string, string>>({});
  const [allocations, setAllocations] = useState<PumpAllocation[]>(defaultAllocations(pumps, activeShift?.staffAssignments));
  const [collections, setCollections] = useState<Record<string, Record<string, string>>>({});
  const [testFuel, setTestFuel] = useState<Record<string, string>>({});
  const [testFuelReturned, setTestFuelReturned] = useState<Record<string, boolean>>(Object.fromEntries(stations.map((station) => [station.stationId, true])));
  const [pumpShiftTimes, setPumpShiftTimes] = useState<PumpShiftTimes>({});
  const [pumpSaving, setPumpSaving] = useState<Record<string, boolean>>({});
  const [pumpSavedAt, setPumpSavedAt] = useState<Record<string, Date>>({});
  const [rates, setRates] = useState<Rates>(Object.fromEntries(products.map((product) => { const snapshot = stations.find((station) => station.productId === product.id); return [product.id, { cost: activeShift ? snapshot?.costPerLitre ?? product.costPricePerLitre : product.costPricePerLitre, selling: activeShift ? snapshot?.pricePerLitre ?? product.sellingPricePerLitre : product.sellingPricePerLitre }]; })));
  const [businessDateDraft, setBusinessDateDraft] = useState(missingBusinessDays[0] ?? businessDate);
  const [openingTankStocks, setOpeningTankStocks] = useState<Record<string, string>>(Object.fromEntries(tanks.map((tank) => [tank.tankId, tank.currentStock])));
  const [closingTankStocks, setClosingTankStocks] = useState<Record<string, string>>(Object.fromEntries(tanks.map((tank) => [tank.tankId, activeShift?.openingTankStocks[tank.tankId] ?? ""])));
  const [activeCorrectionReason, setActiveCorrectionReason] = useState("");
  const [varianceExplanation, setVarianceExplanation] = useState("");
  const [draftSavedAt, setDraftSavedAt] = useState<Date>();
  const [setupSavedAt, setSetupSavedAt] = useState<Date>();
  const [activeBusinessDateDraft, setActiveBusinessDateDraft] = useState(activeShift?.businessDate ?? "");
  const [confirmedBusinessDate, setConfirmedBusinessDate] = useState(activeShift?.businessDate ?? "");
  const [dateSaving, setDateSaving] = useState(false);
  const [dateSavedAt, setDateSavedAt] = useState<Date>();
  const activeBusinessDate = activeShift?.businessDate;
  const activeShiftId = activeShift?.id;
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);
  const rolloverAttempt = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (activeBusinessDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs drafts from the server-driven prop, an external system
      setActiveBusinessDateDraft(activeBusinessDate);
      setConfirmedBusinessDate(activeBusinessDate);
    }
  }, [activeBusinessDate]);
  useEffect(() => {
    if (!activeShiftId || !activeBusinessDate || activeBusinessDate >= today) return;
    const attempt = `${activeShiftId}:${activeBusinessDate}:${today}`;
    if (rolloverAttempt.current === attempt) return;
    rolloverAttempt.current = attempt;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/shifts/${activeShiftId}/rollover`, { method: "POST" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not advance the business date");
        if (!cancelled && body.businessDate !== activeBusinessDate) {
          setActiveBusinessDateDraft(body.businessDate);
          setConfirmedBusinessDate(body.businessDate);
          routerRef.current.refresh();
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not advance the business date");
      }
    })();

    return () => {
      cancelled = true;
      if (rolloverAttempt.current === attempt) rolloverAttempt.current = undefined;
    };
  }, [activeBusinessDate, activeShiftId, today]);
  const closeKey = useRef<string | undefined>(undefined);
  const openingDraftKey = `forecourt-draft:opening:${businessDateDraft}`;
  const closingDraftKey = activeShift ? `forecourt-draft:closing:${activeShift.id}` : undefined;
  const hydratedDraftKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    const key = activeShift ? closingDraftKey : openingDraftKey;
    if (!key || hydratedDraftKey.current === key) return;
    hydratedDraftKey.current = key;
    if (activeShift) {
      const draft = readDraft<ClosingDraft>(key); if (!draft) return;
      // Rates, operator assignments and opening readings are never restored here once a shift is active: they are
      // already saved server-side (Save prices / Save setup changes) and the freshly loaded server props are the
      // source of truth. Restoring them from an old local draft would silently shadow a real, later server update.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring saved state from localStorage, an external system
      if (draft.closingReadings) setClosingReadings(draft.closingReadings);
      if (draft.collections) setCollections(draft.collections);
      if (draft.testFuel) setTestFuel(draft.testFuel);
      if (draft.testFuelReturned) setTestFuelReturned((current) => ({ ...current, ...draft.testFuelReturned }));
      if (draft.closingTankStocks) setClosingTankStocks(draft.closingTankStocks);
      if (draft.activeCorrectionReason) setActiveCorrectionReason(draft.activeCorrectionReason);
      if (draft.varianceExplanation) setVarianceExplanation(draft.varianceExplanation);
      if (draft.pumpShiftTimes) setPumpShiftTimes((current) => ({ ...current, ...draft.pumpShiftTimes }));
      if (draft.allocations) setAllocations(draft.allocations);
    } else {
      const draft = readDraft<OpeningDraft>(key);
      // Every backfilled business date gets its own draft key, so switching the date field must fully reset these
      // fields to that date's own draft (or its blank defaults) rather than leaving another date's typed values behind.
      setAllocations(draft?.allocations ?? defaultAllocations(pumps).map((allocation) => ({ ...allocation, staffId: draft?.operatorIds?.[allocation.pumpId] ?? allocation.staffId })));
      setOpeningReadings(draft?.openingReadings ?? Object.fromEntries(stations.map((station) => [station.stationId, previousReadings[station.stationId] ?? ""])));
      setOpeningTankStocks(draft?.openingTankStocks ?? Object.fromEntries(tanks.map((tank) => [tank.tankId, tank.currentStock])));
      setRates(draft?.rates ?? Object.fromEntries(products.map((product) => [product.id, { cost: product.costPricePerLitre, selling: product.sellingPricePerLitre }])));
    }
  }, [activeShift, openingDraftKey, closingDraftKey, previousReadings, products, pumps, stations, tanks]);

  useEffect(() => {
    if (activeShift) return;
    writeDraft(openingDraftKey, { businessDate: businessDateDraft, allocations, openingReadings, openingTankStocks, rates } satisfies OpeningDraft);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflects the write we just made to localStorage, an external system
    setDraftSavedAt(new Date());
  }, [activeShift, openingDraftKey, businessDateDraft, allocations, openingReadings, openingTankStocks, rates]);

  useEffect(() => {
    if (!activeShift || !closingDraftKey) return;
    writeDraft(closingDraftKey, { closingReadings, collections, testFuel, testFuelReturned, closingTankStocks, activeCorrectionReason, varianceExplanation, pumpShiftTimes, allocations } satisfies ClosingDraft);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflects the write we just made to localStorage, an external system
    setDraftSavedAt(new Date());
  }, [activeShift, closingDraftKey, closingReadings, collections, testFuel, testFuelReturned, closingTankStocks, activeCorrectionReason, varianceExplanation, pumpShiftTimes, allocations]);

  async function openDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      validatePumpAllocations(pumps, allocations, true);
      await Promise.all(products.map(async (product) => {
        const sellingPrice = rates[product.id].selling;
        const response = await fetch(`/api/products/${product.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sellingPricePerLitre: sellingPrice, costPricePerLitre: rates[product.id].cost, marketReferencePrice: sellingPrice })
        });
        const body = await response.json(); if (!response.ok) throw new Error(body.error ?? `Could not update ${product.name} price`);
      }));
      const assignments = assignmentsFromAllocations(allocations, staff);
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
      const pumpAllocations = allocations.filter((allocation) => allocation.pumpId === pump.id);
      const total = (key: string) => Decimal.sum(0, ...pumpAllocations.map((allocation) => number(collections[allocation.id]?.[key]))).toDecimalPlaces(2).toFixed(2);
      return [pump.id, {
        cash: total("cash"), upi: total("upi"), card: total("card"),
        credit: total("credit"), other: total("other"), declaredCashHandover: total("handover")
      }];
    }));
    const sum = (key: keyof (typeof sideCollections)[string]) => Decimal.sum(0, ...Object.values(sideCollections).map((item) => item[key])).toDecimalPlaces(2).toFixed(2);
    const staffHandovers: Record<string, string> = {};
    for (const allocation of allocations) {
      if (!allocation.staffId) continue;
      const values = collections[allocation.id] ?? {};
      const total = Decimal.sum(number(values.cash), number(values.upi), number(values.card), number(values.credit), number(values.other));
      staffHandovers[allocation.staffId] = new Decimal(staffHandovers[allocation.staffId] ?? 0).plus(total).toDecimalPlaces(2).toFixed(2);
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
    validatePumpAllocations(pumps, allocations, false);
    await Promise.all(products.map(async (product) => {
      const sellingPrice = rates[product.id].selling;
      const response = await fetch(`/api/products/${product.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellingPricePerLitre: sellingPrice, costPricePerLitre: rates[product.id].cost, marketReferencePrice: sellingPrice })
      });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? `Could not update ${product.name} price`);
    }));
    const assignments = allocations.flatMap((allocation) => allocation.nozzleIds.map((nozzleId) => {
      const previous = activeShift.staffAssignments.find((assignment) => assignment.nozzleId === nozzleId);
      const staffId = allocation.staffId || previous?.staffId || "";
      const staffName = staff.find((person) => person.id === staffId)?.name ?? previous?.staffName ?? "";
      return { staffId, staffName, nozzleId };
    })).filter((assignment) => assignment.staffId && assignment.staffName);
    const response = await fetch(`/api/shifts/${activeShift.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ openingNozzleReadings: openingReadings, staffAssignments: assignments, productRates: Object.fromEntries(products.map((product) => [product.id, { sellingPricePerLitre: rates[product.id].selling, costPricePerLitre: rates[product.id].cost }])), reason: activeCorrectionReason }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not save today's setup");
  }

  async function saveActiveSetup() {
    setSaving(true); setError("");
    try { await persistActiveSetup(); setPreview(undefined); setSetupSavedAt(new Date()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save today's setup"); }
    finally { setSaving(false); }
  }

  async function savePrices() {
    if (!activeShift) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/shifts/${activeShift.id}/prices`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productRates: Object.fromEntries(products.map((product) => [product.id, { sellingPricePerLitre: rates[product.id].selling, costPricePerLitre: rates[product.id].cost }])) })
      });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not save prices");
      setSetupSavedAt(new Date());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save prices"); }
    finally { setSaving(false); }
  }

  async function saveBusinessDate() {
    if (!activeShift) return;
    setDateSaving(true); setError("");
    try {
      const response = await fetch(`/api/shifts/${activeShift.id}/business-date`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessDate: activeBusinessDateDraft })
      });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not update the business date");
      setConfirmedBusinessDate(body.businessDate ?? activeBusinessDateDraft);
      setDateSavedAt(new Date()); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the business date"); }
    finally { setDateSaving(false); }
  }

  async function completePumpShift(pump: Pump, allocation: PumpAllocation) {
    if (!activeShift) return;
    const staffId = allocation.staffId;
    const person = staff.find((item) => item.id === staffId);
    if (!staffId || !person) { setError(`Select an employee for Pump ${pump.code} before completing the shift.`); return; }
    setPumpSaving((current) => ({ ...current, [allocation.id]: true })); setError("");
    try {
      const assignedStations = pump.stations.filter((station) => allocation.nozzleIds.includes(station.stationId));
      const pumpCollections = collections[allocation.id];
      const closingForPump = Object.fromEntries(assignedStations.map((station) => [station.stationId, number(closingReadings[station.stationId])]));
      const response = await fetch(`/api/shifts/${activeShift.id}/pumps/${pump.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId, staffName: person.name, nozzleIds: allocation.nozzleIds,
          shiftStartTime: pumpShiftTimes[allocation.id]?.start || undefined,
          shiftEndTime: pumpShiftTimes[allocation.id]?.end || undefined,
          closingNozzleReadings: closingForPump,
          nonSaleDispenses: assignedStations.map((station) => ({ nozzleId: station.stationId, volume: number(testFuel[station.stationId]), returnedToTank: testFuelReturned[station.stationId] === true })).filter((entry) => Number(entry.volume) > 0),
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
      setAllocations((current) => current.map((item) => item.id === allocation.id ? { ...item, staffId: "" } : item));
      setPumpShiftTimes((current) => ({ ...current, [allocation.id]: { start: current[allocation.id]?.end ?? "", end: "" } }));
      setCollections((current) => { const next = { ...current }; delete next[allocation.id]; return next; });
      setTestFuel((current) => { const next = { ...current }; for (const station of assignedStations) delete next[station.stationId]; return next; });
      setTestFuelReturned((current) => ({ ...current, ...Object.fromEntries(assignedStations.map((station) => [station.stationId, true])) }));
      setPumpSavedAt((current) => ({ ...current, [allocation.id]: new Date() }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : `Could not complete Pump ${pump.code}'s shift`); }
    finally { setPumpSaving((current) => ({ ...current, [allocation.id]: false })); }
  }

  function handlePumpShiftDeleted(updatedShift: { pumpShiftHistory?: PumpShiftRecord[] }, deletedEntry: PumpShiftRecord) {
    const history = updatedShift.pumpShiftHistory ?? [];
    setPumpShiftHistory(history);
    setOpeningReadings(Object.fromEntries(stations.map((station) => {
      const stationEntries = history.filter((entry) => entry.closingNozzleReadings[station.stationId] !== undefined);
      const latest = stationEntries.at(-1);
      return [station.stationId, latest?.closingNozzleReadings[station.stationId] ?? activeShift?.openingNozzleReadings[station.stationId] ?? previousReadings[station.stationId] ?? ""];
    })));
    const deletedNozzles = new Set(deletedEntry.nozzleIds ?? Object.keys(deletedEntry.closingNozzleReadings));
    setClosingReadings((current) => Object.fromEntries(Object.entries(current).filter(([stationId]) => !deletedNozzles.has(stationId))));
    setTestFuel((current) => Object.fromEntries(Object.entries(current).filter(([stationId]) => !deletedNozzles.has(stationId))));
    setTestFuelReturned((current) => ({ ...current, ...Object.fromEntries([...deletedNozzles].map((stationId) => [stationId, true])) }));
    setPreview(undefined);
    setPumpSavedAt({});
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
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not close the business day"); setClosedRecord({ ...body, businessDate: confirmedBusinessDate || activeShift.businessDate }); if (closingDraftKey) clearDraft(closingDraftKey); router.refresh();
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

  const nextMissingDay = closedRecord ? missingBusinessDays.find((date) => date > closedRecord.businessDate) : undefined;

  return <div className="daily-sheet">
    <section className="day-command panel">
      <div><p className="eyebrow">{confirmedBusinessDate || businessDate} · Owner entry</p><h1>Today&apos;s forecourt sheet</h1><p>One page for staff, eight totalizers, collections and tank reconciliation.</p></div>
      <div className="day-status"><span className={`status-pill ${activeShift ? "warning" : "healthy"}`}>{closedRecord ? "CLOSED" : activeShift ? "OPEN" : "READY"}</span><small>{activeShift ? `Started ${outletTime(activeShift.startedAt)}` : "Confirm the morning position"}</small></div>
    </section>

    {closedRecord ? <section className="closed-day-summary"><CheckCircle2 size={26} /><div><strong>Business day closed and inventory updated</strong><p>{inr(closedRecord.reconciliation.sales.expectedSales)} sales · {closedRecord.reconciliation.products?.reduce((sum, item) => sum + Number(item.litresSold), 0).toFixed(3)} L · {inr(closedRecord.reconciliation.sales.tenderVariance)} tender variance</p><div className="form-actions">{nextMissingDay ? <Link className="button primary" href="/day">Continue with {nextMissingDay}<ArrowRight size={15} /></Link> : null}<Link className={nextMissingDay ? "button" : "button primary"} href={`/shifts/${closedRecord.id}`}>Open permanent day record</Link><Link className="button" href={`/finance?month=${businessDate.slice(0, 7)}`}>View finance</Link><Link className="button" href="/reports">View reports</Link></div></div></section> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {tankLevels.length ? <TankLevelBoard levels={tankLevels} /> : null}
    {!activeShift && missingBusinessDays.length ? <section className="catch-up-banner"><CalendarClock size={18} /><div><strong>{missingBusinessDays.length} business {missingBusinessDays.length === 1 ? "day has" : "days have"} no record: {missingBusinessDays.join(", ")}</strong><small>The business date below is already set to the oldest one, {missingBusinessDays[0]} — enter it exactly as noted down, then close it to move on to the next.</small></div></section> : null}

    {!activeShift ? <><section className="today-setup-strip"><label className="field"><span>Business date</span><input form="daily-opening-form" value={businessDateDraft} onChange={(event) => setBusinessDateDraft(event.target.value)} name="businessDate" type="date" required /></label><form className="inline-operator-form" onSubmit={addOperator}><label><span>Add operator without leaving Today</span><input name="name" placeholder="Operator name" required /></label><button className="button soft" disabled={saving}><Plus size={14} />Add</button></form><div className="attendance-chips">{attendance.map((record) => <span className={`attendance-chip ${record.status.toLowerCase()}`} key={record.staffId}>{record.staffName} · {record.status}</span>)}</div></section><form id="daily-opening-form" onSubmit={openDay}>
      <section className="daily-rate-board"><header><span><small>Step 1 · Set today&apos;s rates</small><strong>Dealer cost &amp; customer price</strong></span><p>These values are locked into today&apos;s sales record and will not change historical profit.</p></header><div className="daily-price-deck">
        {products.map((product) => <article className={`price-ticket ${product.id}`} key={product.id}><div className="price-product"><span className="fuel-dot" /><span><small>Fuel grade</small><strong>{product.name}</strong><small>Margin preview: {inr(String(Number(rates[product.id]?.selling ?? 0) - Number(rates[product.id]?.cost ?? 0)))} / L</small></span></div><label className="rate-field"><span><small>What the outlet pays</small><strong>Reseller purchase price</strong></span><span className="money-control"><b>₹</b><input aria-label={`${product.name} reseller purchase price`} value={rates[product.id]?.cost} onChange={(event) => setRates({ ...rates, [product.id]: { ...rates[product.id], cost: event.target.value } })} min="0" name={`cost-${product.id}`} required step="0.01" type="number" /><em>per litre</em></span></label><label className="rate-field customer"><span><small>Official price charged to customer</small><strong>Market/customer selling price</strong></span><span className="money-control"><b>₹</b><input aria-label={`${product.name} customer selling price`} value={rates[product.id]?.selling} onChange={(event) => setRates({ ...rates, [product.id]: { ...rates[product.id], selling: event.target.value } })} min="0" name={`selling-${product.id}`} required step="0.01" type="number" /><em>per litre</em></span></label></article>)}
      </div></section>
      <PumpDeck pumps={pumps} staff={staff} allocations={allocations} setAllocations={setAllocations} openingReadings={openingReadings} setOpeningReadings={setOpeningReadings} previousReadingSources={previousReadingSources} />
      <TankDeck mode="opening" tanks={tanks} values={openingTankStocks} onChange={setOpeningTankStocks} />
      <div className="daily-sticky-action"><span><strong>{stations.length} nozzles · {pumps.length} staff positions</strong><small>Opening values and prices are snapshotted for today.</small></span>{draftSavedAt ? <span className="draft-saved-indicator"><Save size={14} />Draft saved {draftSavedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span> : null}<button className="button primary" disabled={saving || !staff.length} type="submit"><Play size={16} />{saving ? "Starting…" : "Start business day"}</button></div>
    </form></> : !closedRecord ? <form id="daily-closing-form" onSubmit={review}>
      <section className="active-day-console"><div className="active-day-heading"><span><small>Open day control centre</small><strong>Rates, openings and employees remain correctable until close</strong></span><span className="payroll-commitment"><small>Salary commitment</small><strong>{inr(String(monthlyPayroll))}</strong><em>monthly payroll</em></span></div><div className="active-rate-grid">{[...products].sort((a, b) => (a.code === "PETROL" ? -1 : b.code === "PETROL" ? 1 : 0)).map((product) => <article key={product.id}><span className={`fuel-chip ${product.id}`}>{product.name}</span><label><span>Reseller purchase</span><span className="input-wrap"><input aria-label={`${product.name} active reseller purchase price`} min="0" onChange={(event) => setRates({ ...rates, [product.id]: { ...rates[product.id], cost: event.target.value } })} step="0.01" type="number" value={rates[product.id]?.cost ?? ""} /><span className="unit">₹</span></span></label><label><span>Customer selling</span><span className="input-wrap"><input aria-label={`${product.name} active customer selling price`} min="0" onChange={(event) => setRates({ ...rates, [product.id]: { ...rates[product.id], selling: event.target.value } })} step="0.01" type="number" value={rates[product.id]?.selling ?? ""} /><span className="unit">₹</span></span></label><span className="rate-margin"><small>Margin / L</small><strong>{inr(String(Number(rates[product.id]?.selling || 0) - Number(rates[product.id]?.cost || 0)))}</strong></span></article>)}</div><div className="pump-save-row"><button className="button soft" disabled={saving} onClick={savePrices} type="button"><PencilLine size={15} />{saving ? "Saving…" : "Save prices"}</button>{setupSavedAt ? <span className="pump-saved-indicator"><CheckCircle2 size={13} />Saved {setupSavedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span> : null}</div></section>
      <div className="recording-date-banner"><CalendarClock size={18} /><div className="recording-date-info"><strong>Recording for: {dateLabel(confirmedBusinessDate || activeShift.businessDate)}</strong><small>Entering data for a different day? Correct the date below — you can do this any time before closing this day.</small></div><div className="recording-date-edit"><input aria-label="Active business date" onChange={(event) => setActiveBusinessDateDraft(event.target.value)} type="date" value={activeBusinessDateDraft} /><button className="button soft" disabled={dateSaving || !activeBusinessDateDraft || activeBusinessDateDraft === (confirmedBusinessDate || activeShift.businessDate)} onClick={saveBusinessDate} type="button">{dateSaving ? "Saving…" : "Save date"}</button>{dateSavedAt ? <span className="pump-saved-indicator"><CheckCircle2 size={13} />Date saved {dateSavedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span> : null}</div></div>
      <PumpClosingDeck pumps={pumps} staff={staff} allocations={allocations} setAllocations={setAllocations} openingReadings={openingReadings} setOpeningReadings={setOpeningReadings} closingReadings={closingReadings} setClosingReadings={setClosingReadings} litres={litres} meteredLitres={meteredLitres} revenue={stationRevenue} profit={stationProfit} liveRevenue={liveRevenue} testFuel={testFuel} setTestFuel={setTestFuel} testFuelValue={stationTestFuelValue} collections={collections} setCollections={setCollections} pumpShiftTimes={pumpShiftTimes} setPumpShiftTimes={setPumpShiftTimes} completePumpShift={completePumpShift} pumpSaving={pumpSaving} pumpSavedAt={pumpSavedAt} />
      <TodaySavedPumpShifts entries={pumpShiftHistory} onDeleted={handlePumpShiftDeleted} shiftId={activeShift.id} today={today} />
      <TankDeck mode="closing" tanks={tanks} openingStocks={activeShift.openingTankStocks} values={closingTankStocks} onChange={setClosingTankStocks} />
      <label className="field active-correction-reason"><span>Reason for an opening, employee or rate correction</span><input name="activeCorrectionReason" onChange={(event) => setActiveCorrectionReason(event.target.value)} placeholder="Optional unless correcting the morning sheet" value={activeCorrectionReason} /></label>
      <label className="field variance-note"><span>Variance explanation</span><textarea name="varianceExplanation" onChange={(event) => setVarianceExplanation(event.target.value)} placeholder="Explain any payment, cash or physical tank difference before closing." value={varianceExplanation} /></label>
      {preview ? <ReconciliationPreview preview={preview} /> : null}
      <div className="daily-sticky-action"><span><strong>{preview ? `${inr(preview.sales.expectedSales)} expected · ${inr(preview.sales.accountedTender)} entered` : "Keep setup and closing on this page"}</strong>{preview ? <strong className={`variance-callout ${Number(preview.sales.tenderVariance) < 0 ? "unbalanced" : "balanced"}`}>{varianceLabel(preview.sales.tenderVariance)} tender variance</strong> : <small>Save setup changes, then review the canonical server calculation.</small>}</span>{setupSavedAt ? <span className="draft-saved-indicator"><CheckCircle2 size={14} />Rates &amp; setup saved {setupSavedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span> : draftSavedAt ? <span className="draft-saved-indicator"><Save size={14} />Draft saved {draftSavedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span> : null}<div className="form-actions"><button className="button soft" disabled={saving} onClick={saveActiveSetup} type="button"><PencilLine size={15} />Save setup changes</button><button className="button" disabled={saving} type="submit"><Calculator size={16} />{saving ? "Calculating…" : "Review closing"}</button><button className="button primary" disabled={saving || !preview} onClick={closeDay} type="button"><LockKeyhole size={16} />Close day &amp; update tanks</button></div></div>
    </form> : null}
  </div>;
}

function PumpDeck({ pumps, staff, allocations, setAllocations, openingReadings, setOpeningReadings, previousReadingSources }: { pumps: Pump[]; staff: Staff[]; allocations: PumpAllocation[]; setAllocations: (value: PumpAllocation[]) => void; openingReadings: Record<string, string>; setOpeningReadings: (value: Record<string, string>) => void; previousReadingSources: Record<string, { shiftId: string; businessDate: string }> }) {
  return <>
    <div className="section-step"><span>2</span><div><small>Staff &amp; meter setup</small><strong>Assign one or two employees and confirm opening totalizers</strong></div></div>
    <p className="nozzle-map-note">Each pump has four fixed nozzles. One employee may handle all four, or two employees may handle two nozzles each.</p>
    <section className="pump-deck opening-grid">{pumps.map((pump) => {
      const pumpAllocations = allocations.filter((allocation) => allocation.pumpId === pump.id);
      return <article className="pump-card" key={pump.id}>
        <header><span className="pump-emblem"><Fuel size={20} /></span><span><small>Opening setup</small><strong>Pump {pump.code}</strong></span><Gauge size={22} /></header>
        <div className="employee-allocation-grid">{pumpAllocations.map((allocation, index) => <section className="employee-allocation" key={allocation.id}>
          <div className="employee-allocation-heading"><strong>Employee {index + 1}</strong>{index === 1 ? <button className="text-button" onClick={() => setAllocations(removePumpEmployee(allocations, pump))} type="button">Use one employee</button> : null}</div>
          <label><span>Employee on these nozzles</span><select aria-label={index === 0 ? `Pump ${pump.code} operator` : `Pump ${pump.code} employee ${index + 1}`} name={`staff-${allocation.id}`} onChange={(event) => setAllocations(allocations.map((item) => item.id === allocation.id ? { ...item, staffId: event.target.value } : item))} required value={allocation.staffId}><option value="">Select employee</option>{staff.map((person) => <option key={person.id} value={person.id}>{staffOption(person)}</option>)}</select></label>
          <div className="nozzle-allocation-chips">{pump.stations.map((station) => <button aria-pressed={allocation.nozzleIds.includes(station.stationId)} className={`nozzle-allocation-chip ${station.productId} ${allocation.nozzleIds.includes(station.stationId) ? "selected" : ""}`} key={station.stationId} onClick={() => setAllocations(movePumpNozzle(allocations, pump, allocation, station.stationId))} type="button">{allocatedNozzleLabel(station)}</button>)}</div>
          <small>{allocation.nozzleIds.length} of {pumpAllocations.length === 2 ? 2 : 4} nozzles assigned</small>
        </section>)}</div>
        {pumpAllocations.length === 1 ? <button className="button soft add-pump-employee" disabled={staff.length < 2} onClick={() => setAllocations(addPumpEmployee(allocations, pump))} type="button"><Plus size={14} />Add second employee</button> : null}
        <div className="nozzle-list">{pump.stations.map((station) => <div className="nozzle-entry opening-row" key={station.stationId}><span className={`nozzle-badge ${station.productId}`}><Fuel size={14} />{allocatedNozzleLabel(station)}</span><label className="totalizer-field"><span><PencilLine size={13} />Opening totalizer</span><span className="totalizer-control"><input aria-label={`${station.code} opening totalizer`} value={openingReadings[station.stationId] ?? ""} onChange={(event) => setOpeningReadings({ ...openingReadings, [station.stationId]: event.target.value })} min="0" name={`opening-${station.stationId}`} placeholder="Enter reading" required step="0.001" type="number" /><em>L</em></span><small>{previousReadingSources[station.stationId] ? `From ${previousReadingSources[station.stationId].businessDate} closing` : "First opening — enter manually"}</small></label></div>)}</div>
      </article>;
    })}</section>
  </>;
}

function PumpClosingDeck({ pumps, staff, allocations, setAllocations, openingReadings, setOpeningReadings, closingReadings, setClosingReadings, litres, meteredLitres, revenue, profit, liveRevenue, testFuel, setTestFuel, testFuelValue, collections, setCollections, pumpShiftTimes, setPumpShiftTimes, completePumpShift, pumpSaving, pumpSavedAt }: { pumps: Pump[]; staff: Staff[]; allocations: PumpAllocation[]; setAllocations: (value: PumpAllocation[]) => void; openingReadings: Record<string, string>; setOpeningReadings: (value: Record<string, string>) => void; closingReadings: Record<string, string>; setClosingReadings: (value: Record<string, string>) => void; litres: (station: Station) => number; meteredLitres: (station: Station) => number; revenue: (station: Station) => number; profit: (station: Station) => number; liveRevenue: (station: Station) => number; testFuel: Record<string, string>; setTestFuel: (value: Record<string, string>) => void; testFuelValue: (station: Station) => number; collections: Record<string, Record<string, string>>; setCollections: (value: Record<string, Record<string, string>>) => void; pumpShiftTimes: PumpShiftTimes; setPumpShiftTimes: (value: PumpShiftTimes) => void; completePumpShift: (pump: Pump, allocation: PumpAllocation) => void; pumpSaving: Record<string, boolean>; pumpSavedAt: Record<string, Date> }) {
  function extendShift(allocation: PumpAllocation) {
    const current = pumpShiftTimes[allocation.id] ?? { start: "", end: "" };
    const base = current.end || current.start;
    if (!base) return;
    const [hour, minute] = base.split(":").map(Number);
    const additionalHours = current.end ? 2 : 10;
    const end = `${String((hour + additionalHours) % 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const pumpAllocations = allocations.filter((item) => item.pumpId === allocation.pumpId);
    const allocationIndex = pumpAllocations.findIndex((item) => item.id === allocation.id);
    const nextAllocation = pumpAllocations[allocationIndex + 1];
    setPumpShiftTimes({
      ...pumpShiftTimes,
      [allocation.id]: { ...current, end },
      ...(nextAllocation ? { [nextAllocation.id]: { ...pumpShiftTimes[nextAllocation.id], start: end, end: pumpShiftTimes[nextAllocation.id]?.end ?? "" } } : {})
    });
  }

  return <section className="pump-deck compact-pump-deck">{pumps.map((pump) => {
    const pumpAllocations = allocations.filter((allocation) => allocation.pumpId === pump.id);
    const groups = fuelGroups(pump.stations, litres, revenue, profit);
    const pumpTotal = groups.reduce((sum, group) => ({ litres: sum.litres + group.litres, revenue: sum.revenue + group.revenue, profit: sum.profit + group.profit }), { litres: 0, revenue: 0, profit: 0 });
    const firstTimes = pumpShiftTimes[pumpAllocations[0]?.id] ?? { start: "", end: "" };
    return <article className="pump-card closing compact-pump pump-workspace" key={pump.id}>
      <header className="pump-workspace-header"><span className="pump-emblem"><Fuel size={20} /></span><span className="pump-workspace-title"><small>Live nozzle ledger</small><strong>Pump {pump.code}</strong><em>Two employees per pump · Four nozzles</em></span><span className="pump-window"><small>Shift start</small><b>{firstTimes.start || "Set below"}</b></span><span className="pump-window"><small>Planned end</small><b>{firstTimes.end || "Set below"}</b></span>{pumpAllocations.length === 1 ? <button aria-label={`Add second employee to Pump ${pump.code}`} className="button soft pump-header-action" disabled={staff.length < 2} onClick={() => setAllocations(addPumpEmployee(allocations, pump))} type="button"><Plus size={14} />Add second employee</button> : <button aria-label={`Use one employee on Pump ${pump.code}`} className="button soft pump-header-action" onClick={() => setAllocations(removePumpEmployee(allocations, pump))} type="button">Use one employee</button>}<span className="pump-total"><b>{pump.stations.reduce((sum, station) => sum + meteredLitres(station), 0).toFixed(3)} L</b><small>metered today</small></span></header>
      <div className="employee-shift-grid">{pumpAllocations.map((allocation, index) => {
        const assignedStations = pump.stations.filter((station) => allocation.nozzleIds.includes(station.stationId));
        const expected = assignedStations.reduce((sum, station) => sum + liveRevenue(station), 0);
        const values = collections[allocation.id] ?? {};
        const entered = Object.entries(values).filter(([key]) => key !== "handover").reduce((sum, [, value]) => sum + Number(value || 0), 0);
        const testGroups = fuelGroups(assignedStations, (station) => Number(testFuel[station.stationId] ?? 0), testFuelValue, () => 0).filter((group) => group.litres > 0);
        const label = pumpAllocations.length === 1 ? `Pump ${pump.code}` : `Pump ${pump.code} employee ${index + 1}`;
        const minutes = shiftDuration(pumpShiftTimes[allocation.id]?.start ?? "", pumpShiftTimes[allocation.id]?.end ?? "");
        return <section aria-label={`Pump ${pump.code} employee ${index + 1} workspace`} className="pump-side employee-shift-card" key={allocation.id}>
          <div className="side-owner"><label className="pump-operator-field"><span>Employee {index + 1}</span><select aria-label={pumpAllocations.length === 1 ? `Pump ${pump.code} active operator` : `${label} active operator`} onChange={(event) => setAllocations(allocations.map((item) => item.id === allocation.id ? { ...item, staffId: event.target.value } : item))} required value={allocation.staffId}><option value="">Select</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><div className="employee-time-range"><label><span>Shift start</span><input aria-label={`${label} shift start time`} onChange={(event) => setPumpShiftTimes({ ...pumpShiftTimes, [allocation.id]: { start: event.target.value, end: pumpShiftTimes[allocation.id]?.end ?? "" } })} type="time" value={pumpShiftTimes[allocation.id]?.start ?? ""} /></label><span>to</span><label><span>Actual end</span><input aria-label={`${label} shift end time`} onChange={(event) => setPumpShiftTimes({ ...pumpShiftTimes, [allocation.id]: { start: pumpShiftTimes[allocation.id]?.start ?? "", end: event.target.value } })} type="time" value={pumpShiftTimes[allocation.id]?.end ?? ""} /></label></div>{minutes > 480 ? <span className="overtime-chip">+{Math.floor((minutes - 480) / 60)}h {(minutes - 480) % 60}m overtime</span> : null}</div>
          <strong className="assigned-nozzles-label">Assigned nozzles ({allocation.nozzleIds.length} selected)</strong>
          <div className="assigned-nozzles">{pump.stations.map((station) => <button aria-label={`${label} ${allocatedNozzleLabel(station)}`} aria-pressed={allocation.nozzleIds.includes(station.stationId)} className={`nozzle-allocation-chip ${station.productId} ${allocation.nozzleIds.includes(station.stationId) ? "selected" : ""}`} disabled={pumpAllocations.length !== 2} key={station.stationId} onClick={() => setAllocations(movePumpNozzle(allocations, pump, allocation, station.stationId))} type="button">{allocatedNozzleLabel(station)}</button>)}</div>
          <div className="nozzle-ledger-head"><span>Nozzle</span><span>Opening (L)</span><span>Closing (L)</span><span>Test fuel (L)</span><span>Litres (L)</span><span>Sales (₹)</span><span>Profit (₹)</span></div>
          <div className="nozzle-list compact-nozzle-list">{assignedStations.map((station) => {
            const opening = openingReadings[station.stationId] ?? "";
            return <div className="nozzle-ledger-row" key={station.stationId}><div className="ledger-nozzle"><span className={`nozzle-badge ${station.productId}`}><Fuel size={14} />{allocatedNozzleLabel(station)}</span></div><label><span>Opening</span><span className="input-wrap"><input aria-label={`${station.code} editable opening totalizer`} min="0" onChange={(event) => { const next = event.target.value; const wasUnchanged = closingReadings[station.stationId] === opening; setOpeningReadings({ ...openingReadings, [station.stationId]: next }); if (wasUnchanged) setClosingReadings({ ...closingReadings, [station.stationId]: next }); }} required step="0.001" type="number" value={opening} /><span className="unit">L</span></span></label><label><span>Closing</span><span className="input-wrap"><input aria-label={`${station.code} closing totalizer`} min={opening || "0"} name={`closing-${station.stationId}`} onChange={(event) => setClosingReadings({ ...closingReadings, [station.stationId]: event.target.value })} required step="0.001" type="number" value={closingReadings[station.stationId] ?? ""} /><span className="unit">L</span></span></label><label className="test-fuel-field"><span>Test fuel</span><span className="input-wrap"><input aria-label={`${station.code} test fuel`} min="0" name={`test-${station.stationId}`} onChange={(event) => setTestFuel({ ...testFuel, [station.stationId]: event.target.value })} step="0.001" type="number" value={testFuel[station.stationId] ?? "0"} /><span className="unit">L</span></span></label><div className="ledger-result"><strong>{litres(station).toFixed(3)} L</strong><span>{inr(String(revenue(station)))}</span><small>{inr(String(profit(station)))} profit</small></div></div>;
          })}</div>
          <PumpCollections pump={pump} fieldKey={pumpAllocations.length === 1 ? pump.id : allocation.id} label={label} expected={expected} entered={entered} testGroups={testGroups} values={values} onChange={(next) => setCollections({ ...collections, [allocation.id]: next })} />
          <div className="employee-entry-actions"><button aria-label={`Extend Pump ${pump.code} Employee ${index + 1} shift`} className="button soft" onClick={() => extendShift(allocation)} type="button"><CalendarClock size={14} />Extend shift</button><button aria-label={`Save Pump ${pump.code} Employee ${index + 1} entry`} className="button primary" disabled={pumpSaving[allocation.id]} onClick={() => completePumpShift(pump, allocation)} type="button"><Save size={14} />{pumpSaving[allocation.id] ? "Saving…" : "Save employee entry"}</button>{pumpSavedAt[allocation.id] ? <span className="pump-saved-indicator"><CheckCircle2 size={13} />Saved {pumpSavedAt[allocation.id].toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span> : null}</div>
        </section>;
      })}</div>
      {pumpAllocations.length === 2 ? <div className="employee-handover-strip">Handover between employees keeps the next shift start aligned automatically</div> : null}
      <div className="fuel-summary">
        {groups.map((group) => <div aria-label={`Pump ${pump.code} ${group.productId} total`} className={`fuel-summary-item ${group.productId}`} key={group.productId}>
          <div className="fuel-summary-heading"><span className={`nozzle-badge ${group.productId}`}><Fuel size={15} />{group.productName}</span><small>Today&apos;s fuel performance</small></div>
          <div className="fuel-summary-metrics">
            <span><small>Litres sold</small><strong>{group.litres.toFixed(3)} L</strong></span>
            <span><small>Sales turnover</small><strong>{inr(String(group.revenue))}</strong></span>
            <span><small>Gross profit</small><strong>{inr(String(group.profit))}</strong></span>
          </div>
        </div>)}
        <div aria-label={`Pump ${pump.code} total sales`} className="fuel-summary-total">
          <span><small>Total litres sold</small><strong>{pumpTotal.litres.toFixed(3)} L</strong></span>
          <span><small>Overall turnover</small><strong>{inr(String(pumpTotal.revenue))}</strong></span>
          <span><small>Total gross profit</small><strong>{inr(String(pumpTotal.profit))}</strong></span>
        </div>
      </div>
    </article>;
  })}</section>;
}

function PumpCollections({ pump, fieldKey = pump.id, label = `Pump ${pump.code}`, expected, entered, testGroups, values, onChange }: { pump: Pump; fieldKey?: string; label?: string; expected: number; entered: number; testGroups: FuelGroup[]; values: Record<string, string>; onChange: (values: Record<string, string>) => void }) {
  const fields = [["cash", "Cash", "cash collected"], ["upi", "UPI", "UPI collected"], ["card", "Card", "card collected"], ["credit", "Credit", "credit collected"], ["other", "Other", "other collected"], ["handover", "Cash handed over", "cash handed over"]];
  const variance = entered - expected;
  return <div className="side-collections"><div><IndianRupee size={16} /><span><strong>Collections</strong><small>{label}</small></span><strong className="entered-callout">{inr(String(entered))} entered</strong><strong className={`variance-callout ${variance < 0 ? "unbalanced" : "balanced"}`}>{varianceLabel(variance)} variance</strong></div>{testGroups.length > 0 ? <div className="test-fuel-note"><small>Test fuel excluded from sales, taken from the readings above</small><div className="test-fuel-chips">{testGroups.map((group) => <span aria-label={`${label} ${group.productId} test fuel`} className={`test-fuel-chip ${group.productId}`} key={group.productId}>{group.productName} {group.litres.toFixed(3)} L · {inr(String(group.revenue))}</span>)}</div></div> : null}<div className="collection-grid">{fields.map(([key, fieldLabel, aria]) => <label key={key}><span>{fieldLabel}</span><span className="input-wrap"><input aria-label={`${label} ${aria}`} value={values[key] ?? "0"} onChange={(event) => onChange({ ...values, [key]: event.target.value })} min="0" name={`${key}-${fieldKey}`} step="0.01" type="number" /><span className="unit">₹</span></span></label>)}</div></div>;
}

function TankLevelBoard({ levels }: { levels: TankLevel[] }) {
  return <section className="panel panel-pad tank-level-board"><header><Gauge size={18} /><span><small>Live, read-only</small><strong>Tank levels</strong></span></header><div className="stock-grid">{levels.map((tank) => <article className={`tank-card ${tank.productName.toLowerCase()}`} key={tank.tankId}><div className="tank-top"><div><p className="panel-kicker">{tank.name} · {tank.productName}</p><strong className="tank-value mono">{quantity(tank.currentStock)} L</strong></div><span className={`status-pill ${tank.status === "healthy" ? "healthy" : "warning"}`}>{tank.status}</span></div><div className="tank-bar"><span style={{ width: `${tank.percentage}%` }} /></div><div className="tank-foot"><span>{quantity(tank.currentStock)} L of {quantity(tank.capacityLitres)} L</span><span>{tank.percentage}% full</span></div></article>)}</div></section>;
}

function TankDeck({ tanks, mode, openingStocks = {}, values, onChange }: { tanks: Tank[]; mode: "opening" | "closing"; openingStocks?: Record<string, string>; values: Record<string, string>; onChange: (value: Record<string, string>) => void }) {
  return <section className="tank-ribbon"><div><Fuel size={20} /><span><small>Connected inventory</small><strong>{mode === "opening" ? "Confirm opening tank stock" : "Enter physical closing stock"}</strong></span></div>{tanks.map((tank) => <label key={tank.tankId}><span><strong>{tank.name}</strong><small>{mode === "closing" ? `Opening ${openingStocks[tank.tankId]} L` : tank.productName}</small></span><span className="input-wrap"><input aria-label={`${tank.name} ${mode} stock`} value={values[tank.tankId] ?? ""} onChange={(event) => onChange({ ...values, [tank.tankId]: event.target.value })} min="0" name={`tank-${mode}-${tank.tankId}`} required step="0.001" type="number" /><span className="unit">L</span></span></label>)}</section>;
}

function ReconciliationPreview({ preview }: { preview: ShiftReconciliation }) {
  return <section className="daily-reconciliation"><header><span><small>Server-calculated preview</small><strong>{inr(preview.sales.expectedSales)} expected sales</strong><small>{inr(preview.sales.expectedCashHandover)} expected cash handover</small><strong className={`variance-callout ${Number(preview.sales.cashVariance) < 0 ? "unbalanced" : "balanced"}`}>{varianceLabel(preview.sales.cashVariance)} cash variance</strong></span><span className={preview.sales.tenderVariance === "0.00" ? "status-pill healthy" : "status-pill warning"}>{preview.sales.tenderVariance === "0.00" ? "Tallied" : `${varianceLabel(preview.sales.tenderVariance)} variance`}</span></header><div className="side-result-grid">{preview.sides?.map((side) => <article key={side.sideId}><span><small>{side.sideLabel}</small><strong>{side.staffName}</strong></span><dl><div><dt>Litres</dt><dd>{side.litresSold} L</dd></div><div><dt>Expected</dt><dd>{inr(side.expectedSalesValue)}</dd></div><div><dt>Entered</dt><dd>{inr(side.accountedTender)}</dd></div><div><dt>Variance</dt><dd className={Number(side.tenderVariance) < 0 ? "unbalanced" : "balanced"}>{varianceLabel(side.tenderVariance)}</dd></div></dl><div className="payment-result"><span>Cash {inr(side.cash)}</span><span>UPI {inr(side.upi)}</span><span>Card {inr(side.card)}</span><span>Credit {inr(side.credit)}</span><span>Other {inr(side.other)}</span><span>Handed over {inr(side.declaredCashHandover)}</span></div><div className="side-product-split">{(side.products ?? []).map((product) => <span key={product.productId}><b>{product.productName}</b>{product.litresSold} L · {inr(product.revenue)} · {inr(product.grossProfit)} profit</span>)}</div></article>)}</div><div className="product-result-row">{preview.products?.map((product) => <span key={product.productId}><small>{product.productName}</small><strong>{product.litresSold} L · {inr(product.revenue)}</strong></span>)}</div><div className="tank-result-grid">{Object.entries(preview.tanks).map(([tankId, tank]) => <article key={tankId}><small>{tankId.replaceAll("_", " ")}</small><strong>{tank.expectedClosingStock} L expected</strong><span>{tank.actualClosingStock} L physical · {tank.variance} L variance</span></article>)}</div><div className="employee-result-grid">{preview.staff?.map((person) => <article key={`${person.staffId}:${person.nozzleId}`}><strong>{person.staffName}</strong><span>{person.product} · {person.litresSold} L · {inr(person.expectedSalesValue)}</span><small>{person.machineLabel}</small></article>)}</div></section>;
}
