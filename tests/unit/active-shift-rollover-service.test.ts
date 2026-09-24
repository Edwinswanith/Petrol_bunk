import { describe, expect, it } from "vitest";

import type { PumpShiftRecord, ShiftRecord, StationSnapshot } from "@/server/domain/operations";
import { automaticBusinessDateRollover } from "@/server/services/active-shift-rollover-service";

const stations: StationSnapshot[] = (["a", "b"] as const).flatMap((pump) => [1, 2, 3, 4].map((nozzle) => ({
  stationId: `${pump}_n${nozzle}`,
  code: `${pump.toUpperCase()}-N${nozzle}`,
  name: `Nozzle ${nozzle}`,
  productId: nozzle <= 2 ? "petrol" : "diesel",
  productName: nozzle <= 2 ? "Petrol" : "Diesel",
  tankId: nozzle <= 2 ? "petrol_tank" : "diesel_tank",
  tankName: nozzle <= 2 ? "Petrol Tank" : "Diesel Tank",
  pricePerLitre: "100",
  costPerLitre: "95",
  dispenserId: `pump-${pump}`,
  dispenserCode: pump.toUpperCase(),
  nozzleNumber: nozzle
})));

function entry(pump: "a" | "b", date: string, nozzleIds = [1, 2, 3, 4].map((number) => `${pump}_n${number}`)): PumpShiftRecord {
  return {
    id: `${pump}-${date}-${nozzleIds.join("-")}`,
    pumpId: `pump-${pump}`,
    pumpLabel: `Pump ${pump.toUpperCase()}`,
    staffId: "staff-1",
    staffName: "Employee",
    nozzleIds,
    businessDate: date,
    openingNozzleReadings: Object.fromEntries(nozzleIds.map((id) => [id, "100"])),
    closingNozzleReadings: Object.fromEntries(nozzleIds.map((id) => [id, "200"])),
    nonSaleDispenses: [],
    collections: { cash: "0", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "0" },
    litresSold: "100.000",
    expectedSalesValue: "10000.00",
    accountedTender: "0.00",
    tenderVariance: "-10000.00",
    declaredCashHandover: "0.00",
    cashVariance: "0.00",
    products: [],
    nozzles: {},
    completedAt: `${date}T12:00:00.000Z`
  };
}

function shift(overrides: Partial<ShiftRecord> = {}): ShiftRecord {
  return {
    id: "shift-1",
    name: "Daily forecourt sheet",
    businessDate: "2026-09-23",
    staffOnDuty: [],
    openingNozzleReadings: Object.fromEntries(stations.map((station) => [station.stationId, "100"])),
    openingTankStocks: {},
    stationSnapshots: stations,
    state: "OPEN",
    createdAt: "2026-09-23T00:00:00.000Z",
    startedAt: "2026-09-23T00:00:00.000Z",
    version: 1,
    ...overrides
  };
}

describe("automaticBusinessDateRollover", () => {
  it("advances a completed active day to the current business date", () => {
    const result = automaticBusinessDateRollover(shift({ pumpShiftHistory: [entry("a", "2026-09-23"), entry("b", "2026-09-23")] }), "2026-09-24");

    expect(result).toBe("2026-09-24");
  });

  it("combines two employees' nozzle entries when checking a pump", () => {
    const result = automaticBusinessDateRollover(shift({ pumpShiftHistory: [
      entry("a", "2026-09-23", ["a_n1", "a_n3"]),
      entry("a", "2026-09-23", ["a_n2", "a_n4"]),
      entry("b", "2026-09-23")
    ] }), "2026-09-24");

    expect(result).toBe("2026-09-24");
  });

  it("does not advance while any configured pump or nozzle is incomplete", () => {
    expect(automaticBusinessDateRollover(shift({ pumpShiftHistory: [entry("a", "2026-09-23")] }), "2026-09-24")).toBeNull();
    expect(automaticBusinessDateRollover(shift({ pumpShiftHistory: [
      entry("a", "2026-09-23", ["a_n1", "a_n2"]), entry("b", "2026-09-23")
    ] }), "2026-09-24")).toBeNull();
  });

  it("uses recorded closing-reading keys for legacy entries without nozzleIds", () => {
    const legacy = { ...entry("a", "2026-09-23"), nozzleIds: undefined };
    const result = automaticBusinessDateRollover(shift({ pumpShiftHistory: [legacy, entry("b", "2026-09-23")] }), "2026-09-24");

    expect(result).toBe("2026-09-24");
  });

  it("catches up only across consecutive completed dates and never beyond today", () => {
    const stale = shift({
      businessDate: "2026-09-22",
      pumpShiftHistory: [
        entry("a", "2026-09-22"), entry("b", "2026-09-22"),
        entry("a", "2026-09-23"), entry("b", "2026-09-23")
      ]
    });

    expect(automaticBusinessDateRollover(stale, "2026-09-24")).toBe("2026-09-24");
    expect(automaticBusinessDateRollover(stale, "2026-09-23")).toBe("2026-09-23");
  });

  it("is a no-op for the current date, future dates, closed shifts, or shifts without configured nozzles", () => {
    const complete = shift({ pumpShiftHistory: [entry("a", "2026-09-23"), entry("b", "2026-09-23")] });

    expect(automaticBusinessDateRollover(complete, "2026-09-23")).toBeNull();
    expect(automaticBusinessDateRollover(complete, "2026-09-22")).toBeNull();
    expect(automaticBusinessDateRollover({ ...complete, state: "CLOSED" }, "2026-09-24")).toBeNull();
    expect(automaticBusinessDateRollover({ ...complete, stationSnapshots: [] }, "2026-09-24")).toBeNull();
  });
});
