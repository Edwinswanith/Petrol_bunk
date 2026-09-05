import { describe, expect, it } from "vitest";

import type { ShiftRecord, StationSnapshot } from "@/server/domain/operations";
import { applyPumpShiftCompletion } from "@/server/services/pump-shift-completion-service";

const pumpAStations: StationSnapshot[] = [
  { stationId: "a_n1", code: "A-N1", name: "Nozzle 1", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "102.50", costPerLitre: "96.80", dispenserId: "pump-a" },
  { stationId: "a_n2", code: "A-N2", name: "Nozzle 2", productId: "diesel", productName: "Diesel", tankId: "diesel_tank", tankName: "Diesel Tank", pricePerLitre: "100.50", costPerLitre: "94.40", dispenserId: "pump-a" }
];

function staleShift(overrides: Partial<ShiftRecord> = {}): ShiftRecord {
  return {
    id: "shift-1", name: "Daily", businessDate: "2026-08-31", staffOnDuty: [],
    openingNozzleReadings: { a_n1: "0", a_n2: "0" },
    openingTankStocks: {}, stationSnapshots: pumpAStations,
    state: "OPEN", createdAt: "2026-08-31T00:00:00.000Z", startedAt: "2026-08-31T00:00:00.000Z", version: 1,
    ...overrides
  };
}

describe("applyPumpShiftCompletion", () => {
  it("stamps a completed segment with the real calendar date it was completed on, not the shift's original opening date", () => {
    const shift = staleShift();

    const result = applyPumpShiftCompletion(shift, "pump-a", {
      staffId: "staff-arun", staffName: "Arun",
      closingNozzleReadings: { a_n1: "100", a_n2: "50" }, nonSaleDispenses: []
    }, "2026-09-05T04:00:00.000Z");

    expect(result.pumpShiftHistory?.[0]).toMatchObject({ businessDate: "2026-09-05" });
    expect(shift.businessDate).toBe("2026-08-31");
  });

  it("still stamps today's date on the second segment of a chain that spans a stale shift", () => {
    const shift = staleShift({
      pumpShiftHistory: [{
        id: "seg-1", pumpId: "pump-a", pumpLabel: "Pump A", staffId: "staff-arun", staffName: "Arun",
        businessDate: "2026-08-31", openingNozzleReadings: { a_n1: "0", a_n2: "0" },
        closingNozzleReadings: { a_n1: "100", a_n2: "50" }, nonSaleDispenses: [],
        collections: { cash: "0", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "0" },
        litresSold: "150.000", expectedSalesValue: "0.00", accountedTender: "0.00", tenderVariance: "0.00",
        declaredCashHandover: "0.00", cashVariance: "0.00", products: [], nozzles: {},
        completedAt: "2026-08-31T06:00:00.000Z"
      }]
    });

    const result = applyPumpShiftCompletion(shift, "pump-a", {
      staffId: "staff-priya", staffName: "Priya",
      closingNozzleReadings: { a_n1: "200", a_n2: "150" }, nonSaleDispenses: []
    }, "2026-09-05T04:00:00.000Z");

    expect(result.pumpShiftHistory?.[1]).toMatchObject({ businessDate: "2026-09-05", openingNozzleReadings: { a_n1: "100", a_n2: "50" } });
  });
});
