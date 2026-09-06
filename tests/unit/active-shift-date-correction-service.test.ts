import { describe, expect, it } from "vitest";

import type { PumpShiftRecord, ShiftRecord, StationSnapshot } from "@/server/domain/operations";
import { applyActiveShiftDateCorrection } from "@/server/services/active-shift-correction-service";

const stations: StationSnapshot[] = [
  { stationId: "a_n1", code: "A-N1", name: "Nozzle 1", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "102.50", costPerLitre: "96.80" }
];

const completedEntry: PumpShiftRecord = {
  id: "entry-1", pumpId: "pump-a", pumpLabel: "Pump A", staffId: "arun", staffName: "Arun", businessDate: "2026-09-04",
  openingNozzleReadings: { a_n1: "1000" }, closingNozzleReadings: { a_n1: "1100" }, nonSaleDispenses: [],
  collections: { cash: "0", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "0" },
  litresSold: "100.000", expectedSalesValue: "10250.00", accountedTender: "10250.00", tenderVariance: "0.00",
  declaredCashHandover: "0.00", cashVariance: "0.00", products: [], nozzles: {}, completedAt: "2026-09-06T05:00:00.000Z"
};

function baseShift(overrides: Partial<ShiftRecord> = {}): ShiftRecord {
  return {
    id: "shift-1", name: "Daily", businessDate: "2026-09-04", staffOnDuty: ["Arun"],
    staffAssignments: [{ staffId: "arun", staffName: "Arun", nozzleId: "a_n1" }],
    openingNozzleReadings: { a_n1: "1000" }, openingTankStocks: {}, stationSnapshots: stations,
    state: "OPEN", createdAt: "2026-09-04T00:00:00.000Z", startedAt: "2026-09-04T00:00:00.000Z", version: 1,
    ...overrides
  };
}

describe("applyActiveShiftDateCorrection", () => {
  it("moves the shift to the new business date and records a correction", () => {
    const shift = baseShift();
    const updated = applyActiveShiftDateCorrection(shift, { businessDate: "2026-09-05", reason: "Actually backfilling the 5th" });

    expect(updated.businessDate).toBe("2026-09-05");
    expect(updated.version).toBe(2);
    expect(updated.corrections).toEqual([expect.objectContaining({ reason: "Actually backfilling the 5th", previousBusinessDate: "2026-09-04", revisedBusinessDate: "2026-09-05" })]);
  });

  it("re-stamps every already-completed pump-shift entry with the corrected date, so finance stays consistent", () => {
    const shift = baseShift({ pumpShiftHistory: [completedEntry] });
    const updated = applyActiveShiftDateCorrection(shift, { businessDate: "2026-09-05" });

    expect(updated.pumpShiftHistory?.[0]).toMatchObject({ id: "entry-1", businessDate: "2026-09-05" });
  });

  it("leaves everything untouched and appends no correction when the date is unchanged", () => {
    const shift = baseShift({ pumpShiftHistory: [completedEntry] });
    const updated = applyActiveShiftDateCorrection(shift, { businessDate: "2026-09-04" });

    expect(updated).toEqual(shift);
  });

  it("refuses to correct the date on a closed shift", () => {
    const shift = baseShift({ state: "CLOSED" });
    expect(() => applyActiveShiftDateCorrection(shift, { businessDate: "2026-09-05" })).toThrow("Closed shifts are immutable in v1");
  });

  it("leaves opening readings, staff assignments and rates untouched", () => {
    const shift = baseShift();
    const updated = applyActiveShiftDateCorrection(shift, { businessDate: "2026-09-05" });

    expect(updated.openingNozzleReadings).toEqual(shift.openingNozzleReadings);
    expect(updated.staffAssignments).toEqual(shift.staffAssignments);
    expect(updated.stationSnapshots).toEqual(shift.stationSnapshots);
  });
});
