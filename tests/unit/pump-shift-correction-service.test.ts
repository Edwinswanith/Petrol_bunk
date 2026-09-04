import { describe, expect, it } from "vitest";

import { calculatePumpShiftSummary } from "@/server/calculations/pump-shift-summary";
import type { PumpShiftRecord, ShiftRecord, StationSnapshot } from "@/server/domain/operations";
import { applyPumpShiftEntryCorrection } from "@/server/services/pump-shift-correction-service";

const pumpAStations: StationSnapshot[] = [
  { stationId: "a_n1", code: "A-N1", name: "Nozzle 1", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "102.50", costPerLitre: "96.80", dispenserId: "pump-a" },
  { stationId: "a_n2", code: "A-N2", name: "Nozzle 2", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "102.50", costPerLitre: "96.80", dispenserId: "pump-a" },
  { stationId: "a_n3", code: "A-N3", name: "Nozzle 3", productId: "diesel", productName: "Diesel", tankId: "diesel_tank", tankName: "Diesel Tank", pricePerLitre: "100.50", costPerLitre: "94.40", dispenserId: "pump-a" }
];
const pumpBStations: StationSnapshot[] = [
  { stationId: "b_n1", code: "B-N1", name: "Nozzle 1", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "102.50", costPerLitre: "96.80", dispenserId: "pump-b" }
];

function makeEntry(params: {
  id: string; pumpId: string; stations: StationSnapshot[];
  opening: Record<string, string>; closing: Record<string, string>;
  staffId: string; staffName: string;
  nonSaleDispenses?: PumpShiftRecord["nonSaleDispenses"];
  collections?: PumpShiftRecord["collections"];
  shiftStartTime?: string; shiftEndTime?: string;
}): PumpShiftRecord {
  const nonSaleDispenses = params.nonSaleDispenses ?? [];
  const summary = calculatePumpShiftSummary({
    stations: params.stations, openingReadings: params.opening, closingReadings: params.closing,
    nonSaleDispenses, collections: params.collections, staffId: params.staffId, staffName: params.staffName
  });
  return {
    id: params.id, pumpId: params.pumpId, pumpLabel: `Pump ${params.pumpId}`,
    staffId: params.staffId, staffName: params.staffName, businessDate: "2026-09-04",
    shiftStartTime: params.shiftStartTime, shiftEndTime: params.shiftEndTime,
    openingNozzleReadings: params.opening, closingNozzleReadings: params.closing, nonSaleDispenses,
    collections: { cash: summary.cash, upi: summary.upi, card: summary.card, credit: summary.credit, other: summary.other, declaredCashHandover: summary.declaredCashHandover },
    litresSold: summary.litresSold, expectedSalesValue: summary.expectedSalesValue,
    accountedTender: summary.accountedTender, tenderVariance: summary.tenderVariance,
    declaredCashHandover: summary.declaredCashHandover, cashVariance: summary.cashVariance,
    products: summary.products, nozzles: summary.nozzles, completedAt: "2026-09-04T06:00:00.000Z"
  };
}

function baseShift(overrides: Partial<ShiftRecord> = {}): ShiftRecord {
  return {
    id: "shift-1", name: "Daily", businessDate: "2026-09-04", staffOnDuty: [],
    openingNozzleReadings: { a_n1: "0", a_n2: "0", a_n3: "0", b_n1: "0" },
    openingTankStocks: {}, stationSnapshots: [...pumpAStations, ...pumpBStations],
    state: "OPEN", createdAt: "2026-09-04T00:00:00.000Z", startedAt: "2026-09-04T00:00:00.000Z", version: 1,
    ...overrides
  };
}

describe("applyPumpShiftEntryCorrection", () => {
  it("corrects a single entry's closing readings and collections when there is no downstream entry", () => {
    const entry = makeEntry({
      id: "seg-1", pumpId: "pump-a", stations: pumpAStations, staffId: "staff-arun", staffName: "Arun",
      opening: { a_n1: "1000", a_n2: "2000", a_n3: "3000" }, closing: { a_n1: "1100", a_n2: "2050", a_n3: "3030" },
      collections: { cash: "18390", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "18390" }
    });
    const shift = baseShift({ pumpShiftHistory: [entry] });

    const updated = applyPumpShiftEntryCorrection(shift, "pump-a", "seg-1", {
      staffId: "staff-arun", staffName: "Arun",
      closingNozzleReadings: { a_n1: "1120", a_n2: "2050", a_n3: "3030" },
      nonSaleDispenses: [],
      collections: { cash: "20440.00", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "20440.00" },
      reason: "Mistyped closing reading on nozzle 1"
    });

    const corrected = updated.pumpShiftHistory![0];
    expect(corrected.litresSold).toBe("200.000");
    expect(corrected.expectedSalesValue).toBe("20440.00");
    expect(corrected.tenderVariance).toBe("0.00");
    expect(corrected.corrections).toHaveLength(1);
    expect(corrected.corrections![0]).toMatchObject({
      reason: "Mistyped closing reading on nozzle 1",
      previousClosingNozzleReadings: { a_n1: "1100", a_n2: "2050", a_n3: "3030" },
      revisedClosingNozzleReadings: { a_n1: "1120", a_n2: "2050", a_n3: "3030" }
    });
    expect(updated.version).toBe(shift.version + 1);
  });

  it("cascades a correction into the immediately following entry on the same pump, recomputing its litres and revenue", () => {
    const seg1 = makeEntry({ id: "seg-1", pumpId: "pump-a", stations: pumpAStations, staffId: "staff-arun", staffName: "Arun", opening: { a_n1: "0", a_n2: "0", a_n3: "0" }, closing: { a_n1: "100", a_n2: "0", a_n3: "0" } });
    const seg2 = makeEntry({ id: "seg-2", pumpId: "pump-a", stations: pumpAStations, staffId: "staff-priya", staffName: "Priya", opening: { a_n1: "100", a_n2: "0", a_n3: "0" }, closing: { a_n1: "250", a_n2: "0", a_n3: "0" } });
    const shift = baseShift({ pumpShiftHistory: [seg1, seg2] });

    const updated = applyPumpShiftEntryCorrection(shift, "pump-a", "seg-1", {
      staffId: "staff-arun", staffName: "Arun",
      closingNozzleReadings: { a_n1: "120", a_n2: "0", a_n3: "0" },
      nonSaleDispenses: [], reason: "Missed 20 litres on the reading"
    });

    const [correctedSeg1, cascadedSeg2] = updated.pumpShiftHistory!;
    expect(correctedSeg1.litresSold).toBe("120.000");
    expect(cascadedSeg2.openingNozzleReadings).toEqual({ a_n1: "120", a_n2: "0", a_n3: "0" });
    expect(cascadedSeg2.closingNozzleReadings).toEqual({ a_n1: "250", a_n2: "0", a_n3: "0" });
    expect(cascadedSeg2.litresSold).toBe("130.000");
    expect(cascadedSeg2.cascadeAdjustment).toMatchObject({ fromEntryId: "seg-1" });
    expect(cascadedSeg2.corrections).toBeUndefined();
  });

  it("leaves an entry further downstream untouched when the entry directly between it and the correction keeps its own closing reading", () => {
    const seg1 = makeEntry({ id: "seg-1", pumpId: "pump-a", stations: pumpAStations, staffId: "staff-arun", staffName: "Arun", opening: { a_n1: "0", a_n2: "0", a_n3: "0" }, closing: { a_n1: "100", a_n2: "0", a_n3: "0" } });
    const seg2 = makeEntry({ id: "seg-2", pumpId: "pump-a", stations: pumpAStations, staffId: "staff-priya", staffName: "Priya", opening: { a_n1: "100", a_n2: "0", a_n3: "0" }, closing: { a_n1: "250", a_n2: "0", a_n3: "0" } });
    const seg3 = makeEntry({ id: "seg-3", pumpId: "pump-a", stations: pumpAStations, staffId: "staff-kumar", staffName: "Kumar", opening: { a_n1: "250", a_n2: "0", a_n3: "0" }, closing: { a_n1: "400", a_n2: "0", a_n3: "0" } });
    const shift = baseShift({ pumpShiftHistory: [seg1, seg2, seg3] });

    const updated = applyPumpShiftEntryCorrection(shift, "pump-a", "seg-1", {
      staffId: "staff-arun", staffName: "Arun",
      closingNozzleReadings: { a_n1: "120", a_n2: "0", a_n3: "0" },
      nonSaleDispenses: [], reason: "Missed 20 litres on the reading"
    });

    const untouchedSeg3 = updated.pumpShiftHistory![2];
    expect(untouchedSeg3).toEqual(seg3);
    expect(untouchedSeg3.cascadeAdjustment).toBeUndefined();
  });

  it("does not touch entries belonging to a different pump", () => {
    const segA = makeEntry({ id: "seg-a", pumpId: "pump-a", stations: pumpAStations, staffId: "staff-arun", staffName: "Arun", opening: { a_n1: "0", a_n2: "0", a_n3: "0" }, closing: { a_n1: "100", a_n2: "0", a_n3: "0" } });
    const segB = makeEntry({ id: "seg-b", pumpId: "pump-b", stations: pumpBStations, staffId: "staff-ravi", staffName: "Ravi", opening: { b_n1: "0" }, closing: { b_n1: "50" } });
    const shift = baseShift({ pumpShiftHistory: [segA, segB] });

    const updated = applyPumpShiftEntryCorrection(shift, "pump-a", "seg-a", {
      staffId: "staff-arun", staffName: "Arun",
      closingNozzleReadings: { a_n1: "150", a_n2: "0", a_n3: "0" },
      nonSaleDispenses: [], reason: "Correcting pump A only"
    });

    expect(updated.pumpShiftHistory![1]).toEqual(segB);
  });

  it("refuses to correct an entry whose id matches but whose pump does not", () => {
    const entry = makeEntry({ id: "seg-1", pumpId: "pump-a", stations: pumpAStations, staffId: "staff-arun", staffName: "Arun", opening: { a_n1: "0", a_n2: "0", a_n3: "0" }, closing: { a_n1: "100", a_n2: "0", a_n3: "0" } });
    const shift = baseShift({ pumpShiftHistory: [entry] });

    expect(() => applyPumpShiftEntryCorrection(shift, "pump-b", "seg-1", {
      staffId: "staff-arun", staffName: "Arun", closingNozzleReadings: { b_n1: "10" }, nonSaleDispenses: [], reason: "Wrong pump id"
    })).toThrow("Pump shift record not found");
  });

  it("refuses to correct a missing entry", () => {
    const shift = baseShift({ pumpShiftHistory: [] });
    expect(() => applyPumpShiftEntryCorrection(shift, "pump-a", "missing-entry", {
      staffId: "staff-arun", staffName: "Arun", closingNozzleReadings: { a_n1: "10", a_n2: "0", a_n3: "0" }, nonSaleDispenses: [], reason: "Does not exist"
    })).toThrow("Pump shift record not found");
  });

  it("refuses to correct an entry on a closed business day", () => {
    const entry = makeEntry({ id: "seg-1", pumpId: "pump-a", stations: pumpAStations, staffId: "staff-arun", staffName: "Arun", opening: { a_n1: "0", a_n2: "0", a_n3: "0" }, closing: { a_n1: "100", a_n2: "0", a_n3: "0" } });
    const shift = baseShift({ state: "CLOSED", pumpShiftHistory: [entry] });

    expect(() => applyPumpShiftEntryCorrection(shift, "pump-a", "seg-1", {
      staffId: "staff-arun", staffName: "Arun", closingNozzleReadings: { a_n1: "120", a_n2: "0", a_n3: "0" }, nonSaleDispenses: [], reason: "Too late"
    })).toThrow("Closed shifts are immutable in v1");
  });

  it("rejects a correction that would make a later segment's closing reading fall below its new opening reading", () => {
    const seg1 = makeEntry({ id: "seg-1", pumpId: "pump-a", stations: pumpAStations, staffId: "staff-arun", staffName: "Arun", opening: { a_n1: "0", a_n2: "0", a_n3: "0" }, closing: { a_n1: "100", a_n2: "0", a_n3: "0" } });
    const seg2 = makeEntry({ id: "seg-2", pumpId: "pump-a", stations: pumpAStations, staffId: "staff-priya", staffName: "Priya", opening: { a_n1: "100", a_n2: "0", a_n3: "0" }, closing: { a_n1: "250", a_n2: "0", a_n3: "0" } });
    const shift = baseShift({ pumpShiftHistory: [seg1, seg2] });

    expect(() => applyPumpShiftEntryCorrection(shift, "pump-a", "seg-1", {
      staffId: "staff-arun", staffName: "Arun",
      closingNozzleReadings: { a_n1: "300", a_n2: "0", a_n3: "0" },
      nonSaleDispenses: [], reason: "Overcorrected"
    })).toThrow(/Priya/);
  });

  it("does not record a correction or a cascade adjustment when nothing actually changed", () => {
    const seg1 = makeEntry({ id: "seg-1", pumpId: "pump-a", stations: pumpAStations, staffId: "staff-arun", staffName: "Arun", opening: { a_n1: "0", a_n2: "0", a_n3: "0" }, closing: { a_n1: "100", a_n2: "0", a_n3: "0" } });
    const seg2 = makeEntry({ id: "seg-2", pumpId: "pump-a", stations: pumpAStations, staffId: "staff-priya", staffName: "Priya", opening: { a_n1: "100", a_n2: "0", a_n3: "0" }, closing: { a_n1: "250", a_n2: "0", a_n3: "0" } });
    const shift = baseShift({ pumpShiftHistory: [seg1, seg2] });

    const updated = applyPumpShiftEntryCorrection(shift, "pump-a", "seg-1", {
      staffId: "staff-arun", staffName: "Arun",
      closingNozzleReadings: { a_n1: "100", a_n2: "0", a_n3: "0" },
      nonSaleDispenses: [], reason: "Resubmitting the same values"
    });

    expect(updated.pumpShiftHistory![0].corrections).toBeUndefined();
    expect(updated.pumpShiftHistory![1]).toEqual(seg2);
  });
});
