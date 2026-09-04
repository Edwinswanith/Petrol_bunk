import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryForecourtConfigStore, getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";
import { createMemoryOperationsRepository } from "@/server/repositories/memory-operations-repository";
import { prepareCloseInput } from "@/server/services/close-input-service";
import { prepareOpenShiftInput } from "@/server/services/open-input-service";

describe("completing an individual pump's shift on an open business day", () => {
  beforeEach(() => {
    globalThis.forecourtConfigStore = createMemoryForecourtConfigStore({ seedDefaults: true });
  });

  async function openTodaysShift(repository: ReturnType<typeof createMemoryOperationsRepository>) {
    const configuration = await getForecourtConfigStore().getConfiguration();
    const stations = configuration.stations.filter((station) => station.active);
    const prepared = await prepareOpenShiftInput({
      name: "Daily forecourt sheet", businessDate: "2026-09-04", staffOnDuty: ["Kumar", "Arun"],
      staffAssignments: stations.map((station) => ({ staffId: station.dispenserId === "pump-1" ? "staff-kumar" : "staff-arun", staffName: station.dispenserId === "pump-1" ? "Kumar" : "Arun", nozzleId: station.id })),
      openingNozzleReadings: Object.fromEntries(stations.map((station) => [station.id, "1000"])),
      openingTankStocks: Object.fromEntries(configuration.tanks.filter((tank) => tank.active).map((tank) => [tank.id, tank.currentStock]))
    });
    return repository.openShift(prepared, "open-key");
  }

  it("appends a computed record for that pump, leaving the other pump and tank stock untouched", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await openTodaysShift(repository);
    const beforeStock = (await getForecourtConfigStore().getConfiguration()).tanks.find((tank) => tank.id === "petrol_tank")?.currentStock;

    const afterPumpOne = await repository.completePumpShift(shift.id, "pump-1", {
      staffId: "staff-kumar", staffName: "Kumar", shiftStartTime: "06:00", shiftEndTime: "14:00",
      closingNozzleReadings: { a_n1: "1100", a_n2: "1050", a_n3: "1080", a_n4: "1040" },
      nonSaleDispenses: [{ nozzleId: "a_n1", volume: "2", returnedToTank: true }],
      collections: { cash: "5000", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "5000" }
    });

    expect(afterPumpOne.pumpShiftHistory).toHaveLength(1);
    expect(afterPumpOne.pumpShiftHistory?.[0]).toMatchObject({
      pumpId: "pump-1", staffId: "staff-kumar", staffName: "Kumar", shiftStartTime: "06:00", shiftEndTime: "14:00",
      openingNozzleReadings: { a_n1: "1000", a_n2: "1000", a_n3: "1000", a_n4: "1000" },
      closingNozzleReadings: { a_n1: "1100", a_n2: "1050", a_n3: "1080", a_n4: "1040" },
      litresSold: "268.000"
    });
    expect(afterPumpOne.version).toBe(shift.version + 1);

    const afterPumpTwo = await repository.completePumpShift(shift.id, "pump-2", {
      staffId: "staff-arun", staffName: "Arun", closingNozzleReadings: { b_n1: "1010", b_n2: "1010", b_n3: "1010", b_n4: "1010" }, nonSaleDispenses: []
    });

    expect(afterPumpTwo.pumpShiftHistory).toHaveLength(2);
    expect(afterPumpTwo.pumpShiftHistory?.find((entry) => entry.pumpId === "pump-1")).toBeDefined();

    const afterStock = (await getForecourtConfigStore().getConfiguration()).tanks.find((tank) => tank.id === "petrol_tank")?.currentStock;
    expect(afterStock).toBe(beforeStock);
  });

  it("chains the next segment's opening readings from the previous segment's closing readings", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await openTodaysShift(repository);

    await repository.completePumpShift(shift.id, "pump-1", {
      staffId: "staff-kumar", staffName: "Kumar",
      closingNozzleReadings: { a_n1: "1100", a_n2: "1050", a_n3: "1080", a_n4: "1040" }, nonSaleDispenses: []
    });
    const second = await repository.completePumpShift(shift.id, "pump-1", {
      staffId: "staff-priya", staffName: "Priya",
      closingNozzleReadings: { a_n1: "1150", a_n2: "1100", a_n3: "1120", a_n4: "1080" }, nonSaleDispenses: []
    });

    expect(second.pumpShiftHistory?.[1]).toMatchObject({
      staffId: "staff-priya",
      openingNozzleReadings: { a_n1: "1100", a_n2: "1050", a_n3: "1080", a_n4: "1040" }
    });
    expect(second.openingNozzleReadings).toEqual(shift.openingNozzleReadings);
  });

  it("carries every completed segment's collections and test fuel into the final whole-day close", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await openTodaysShift(repository);

    await repository.completePumpShift(shift.id, "pump-1", {
      staffId: "staff-kumar", staffName: "Kumar",
      closingNozzleReadings: { a_n1: "1100", a_n2: "1050", a_n3: "1080", a_n4: "1040" },
      nonSaleDispenses: [{ nozzleId: "a_n1", volume: "2", returnedToTank: true }],
      collections: { cash: "5000", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "5000" }
    });
    const shiftAfterOneSegment = await repository.findShift(shift.id);
    if (!shiftAfterOneSegment) throw new Error("Shift not found");

    const closeInput = await prepareCloseInput(shiftAfterOneSegment, {
      closingNozzleReadings: { a_n1: "1200", a_n2: "1200", a_n3: "1200", a_n4: "1200", b_n1: "1200", b_n2: "1200", b_n3: "1200", b_n4: "1200" },
      closingTankStocks: shift.openingTankStocks, nonSaleDispenses: [],
      receipts: Object.fromEntries(Object.keys(shift.openingTankStocks).map((tankId) => [tankId, "0"])),
      sideCollections: {
        "pump-1": { cash: "1000", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "1000" },
        "pump-2": { cash: "0", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "0" }
      },
      staffHandovers: {}, lubricantRevenue: "0", lubricantCost: "0", expenses: "0", varianceExplanation: "Test closure",
      payments: { cashSales: "0", upi: "0", card: "0", credit: "0", other: "0", cashReceipts: "0", cashExpenses: "0", cashRemovals: "0", declaredCashHandover: "0" }
    });

    expect(closeInput.payments.cashSales).toBe("6000");
    expect(closeInput.nonSaleDispenses).toEqual([{ nozzleId: "a_n1", volume: "2", returnedToTank: true }]);

    const closed = await repository.closeShift(shift.id, closeInput, "close-key");
    expect(closed.pumpShiftHistory).toHaveLength(1);
  });

  it("refuses to complete a pump's shift on a closed business day", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await openTodaysShift(repository);
    const closeInput = await prepareCloseInput(shift, {
      closingNozzleReadings: Object.fromEntries((shift.stationSnapshots ?? []).map((station) => [station.stationId, "1001"])),
      closingTankStocks: shift.openingTankStocks, nonSaleDispenses: [],
      receipts: Object.fromEntries(Object.keys(shift.openingTankStocks).map((tankId) => [tankId, "0"])),
      sideCollections: { "pump-1": { cash: "0", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "0" }, "pump-2": { cash: "0", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "0" } },
      staffHandovers: {}, lubricantRevenue: "0", lubricantCost: "0", expenses: "0", varianceExplanation: "Test closure",
      payments: { cashSales: "0", upi: "0", card: "0", credit: "0", other: "0", cashReceipts: "0", cashExpenses: "0", cashRemovals: "0", declaredCashHandover: "0" }
    });
    await repository.closeShift(shift.id, closeInput, "close-key");

    await expect(repository.completePumpShift(shift.id, "pump-1", { staffId: "staff-kumar", staffName: "Kumar", closingNozzleReadings: {}, nonSaleDispenses: [] }))
      .rejects.toThrow("Closed shifts are immutable in v1");
  });

  it("refuses to complete a pump's shift for a shift that does not exist", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    await expect(repository.completePumpShift("missing-shift", "pump-1", { staffId: "staff-kumar", staffName: "Kumar", closingNozzleReadings: {}, nonSaleDispenses: [] }))
      .rejects.toThrow("Shift not found");
  });

  it("refuses when a closing reading is missing for one of the pump's stations", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await openTodaysShift(repository);

    await expect(repository.completePumpShift(shift.id, "pump-1", {
      staffId: "staff-kumar", staffName: "Kumar",
      closingNozzleReadings: { a_n1: "1100" }, nonSaleDispenses: []
    })).rejects.toThrow("Missing closing reading for a_n2");
  });

  it("refuses a closing reading below the resolved opening reading", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await openTodaysShift(repository);

    await expect(repository.completePumpShift(shift.id, "pump-1", {
      staffId: "staff-kumar", staffName: "Kumar",
      closingNozzleReadings: { a_n1: "900", a_n2: "1050", a_n3: "1080", a_n4: "1040" }, nonSaleDispenses: []
    })).rejects.toThrow("Closing totalizer cannot be below opening totalizer");
  });
});
