import { describe, expect, it } from "vitest";

import type { ShiftRecord, StationSnapshot } from "@/server/domain/operations";
import { applyActiveShiftPriceUpdate } from "@/server/services/active-shift-correction-service";

const stations: StationSnapshot[] = [
  { stationId: "a_n1", code: "A-N1", name: "Nozzle 1", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "102.50", costPerLitre: "96.80" },
  { stationId: "a_n3", code: "A-N3", name: "Nozzle 3", productId: "diesel", productName: "Diesel", tankId: "diesel_tank", tankName: "Diesel Tank", pricePerLitre: "100.50", costPerLitre: "94.40" }
];

function baseShift(overrides: Partial<ShiftRecord> = {}): ShiftRecord {
  return {
    id: "shift-1", name: "Daily", businessDate: "2026-09-05", staffOnDuty: ["Arun"],
    staffAssignments: [{ staffId: "arun", staffName: "Arun", nozzleId: "a_n1" }],
    openingNozzleReadings: { a_n1: "1000", a_n3: "2000" }, openingTankStocks: {}, stationSnapshots: stations,
    state: "OPEN", createdAt: "2026-09-05T00:00:00.000Z", startedAt: "2026-09-05T00:00:00.000Z", version: 1,
    ...overrides
  };
}

describe("applyActiveShiftPriceUpdate", () => {
  it("updates only the affected product's station snapshots, leaving openings and staff assignments untouched", () => {
    const shift = baseShift();
    const updated = applyActiveShiftPriceUpdate(shift, { productRates: { petrol: { sellingPricePerLitre: "108.17", costPricePerLitre: "96.80" } }, reason: "Rate revision" });

    expect(updated.stationSnapshots?.find((station) => station.stationId === "a_n1")).toEqual(expect.objectContaining({ pricePerLitre: "108.17", costPerLitre: "96.80" }));
    expect(updated.stationSnapshots?.find((station) => station.stationId === "a_n3")).toEqual(expect.objectContaining({ pricePerLitre: "100.50", costPerLitre: "94.40" }));
    expect(updated.openingNozzleReadings).toEqual(shift.openingNozzleReadings);
    expect(updated.staffAssignments).toEqual(shift.staffAssignments);
    expect(updated.version).toBe(2);
    expect(updated.corrections).toEqual([expect.objectContaining({ reason: "Rate revision" })]);
  });

  it("succeeds even when the shift's own opening readings or staff assignments would otherwise be incomplete, since this update never touches them", () => {
    const shift = baseShift({ openingNozzleReadings: { a_n1: "1000" }, staffAssignments: [] });
    const updated = applyActiveShiftPriceUpdate(shift, { productRates: { diesel: { sellingPricePerLitre: "99.93", costPricePerLitre: "94.40" } } });

    expect(updated.stationSnapshots?.find((station) => station.stationId === "a_n3")).toEqual(expect.objectContaining({ pricePerLitre: "99.93" }));
    expect(updated.openingNozzleReadings).toEqual({ a_n1: "1000" });
    expect(updated.staffAssignments).toEqual([]);
  });

  it("refuses to update prices on a closed shift", () => {
    const shift = baseShift({ state: "CLOSED" });
    expect(() => applyActiveShiftPriceUpdate(shift, { productRates: { petrol: { sellingPricePerLitre: "108.17", costPricePerLitre: "96.80" } } }))
      .toThrow("Closed shifts are immutable in v1");
  });

  it("does not append a correction record when the submitted rate matches the existing one", () => {
    const shift = baseShift();
    const updated = applyActiveShiftPriceUpdate(shift, { productRates: { petrol: { sellingPricePerLitre: "102.50", costPricePerLitre: "96.80" } } });
    expect(updated.corrections ?? []).toHaveLength(0);
  });
});
