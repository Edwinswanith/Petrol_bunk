import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryForecourtConfigStore, getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";
import { createMemoryOperationsRepository } from "@/server/repositories/memory-operations-repository";
import { prepareCloseInput } from "@/server/services/close-input-service";
import { prepareOpenShiftInput } from "@/server/services/open-input-service";

describe("saving an individual pump's progress on an open shift", () => {
  beforeEach(() => {
    globalThis.forecourtConfigStore = createMemoryForecourtConfigStore({ seedDefaults: true });
  });

  async function openTodaysShift(repository: ReturnType<typeof createMemoryOperationsRepository>) {
    const configuration = await getForecourtConfigStore().getConfiguration();
    const stations = configuration.stations.filter((station) => station.active);
    const prepared = await prepareOpenShiftInput({
      name: "Daily forecourt sheet", businessDate: "2026-09-03", staffOnDuty: ["Kumar", "Arun"],
      staffAssignments: stations.map((station) => ({ staffId: station.dispenserId === "pump-1" ? "staff-kumar" : "staff-arun", staffName: station.dispenserId === "pump-1" ? "Kumar" : "Arun", nozzleId: station.id })),
      openingNozzleReadings: Object.fromEntries(stations.map((station) => [station.id, "1000"])),
      openingTankStocks: Object.fromEntries(configuration.tanks.filter((tank) => tank.active).map((tank) => [tank.id, tank.currentStock]))
    });
    return repository.openShift(prepared, "open-key");
  }

  it("saves one pump's shift time, readings and collections without touching another pump's saved progress or the tank stock", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await openTodaysShift(repository);
    const beforeStock = (await getForecourtConfigStore().getConfiguration()).tanks.find((tank) => tank.id === "petrol_tank")?.currentStock;

    const afterPumpOne = await repository.saveShiftPumpProgress(shift.id, "pump-1", {
      shiftStartTime: "06:00", shiftEndTime: "18:00",
      closingNozzleReadings: { a_n1: "1100", a_n2: "1050", a_n3: "1080", a_n4: "1040" },
      nonSaleDispenses: [{ nozzleId: "a_n1", volume: "2", returnedToTank: true }],
      collections: { cash: "5000", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "5000" }
    });

    expect(afterPumpOne.pumpProgress?.["pump-1"]).toMatchObject({
      pumpId: "pump-1", shiftStartTime: "06:00", shiftEndTime: "18:00",
      closingNozzleReadings: { a_n1: "1100", a_n2: "1050", a_n3: "1080", a_n4: "1040" },
      nonSaleDispenses: [{ nozzleId: "a_n1", volume: "2", returnedToTank: true }]
    });
    expect(afterPumpOne.version).toBe(shift.version + 1);
    expect(afterPumpOne.pumpProgress?.["pump-2"]).toBeUndefined();

    const afterPumpTwo = await repository.saveShiftPumpProgress(shift.id, "pump-2", {
      closingNozzleReadings: { b_n1: "2000" }, nonSaleDispenses: []
    });

    expect(afterPumpTwo.pumpProgress?.["pump-1"]).toBeDefined();
    expect(afterPumpTwo.pumpProgress?.["pump-2"]).toMatchObject({ pumpId: "pump-2" });

    const afterStock = (await getForecourtConfigStore().getConfiguration()).tanks.find((tank) => tank.id === "petrol_tank")?.currentStock;
    expect(afterStock).toBe(beforeStock);
  });

  it("overwrites only the same pump's previous save, not the other fields already recorded for it", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await openTodaysShift(repository);

    await repository.saveShiftPumpProgress(shift.id, "pump-1", {
      shiftStartTime: "06:00", closingNozzleReadings: { a_n1: "1100" }, nonSaleDispenses: []
    });
    const second = await repository.saveShiftPumpProgress(shift.id, "pump-1", {
      shiftStartTime: "06:00", shiftEndTime: "18:00", closingNozzleReadings: { a_n1: "1150" }, nonSaleDispenses: []
    });

    expect(second.pumpProgress?.["pump-1"]).toMatchObject({ shiftEndTime: "18:00", closingNozzleReadings: { a_n1: "1150" } });
  });

  it("refuses to save pump progress on a closed shift", async () => {
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

    await expect(repository.saveShiftPumpProgress(shift.id, "pump-1", { closingNozzleReadings: {}, nonSaleDispenses: [] }))
      .rejects.toThrow("Closed shifts are immutable in v1");
  });

  it("refuses to save progress for a shift that does not exist", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    await expect(repository.saveShiftPumpProgress("missing-shift", "pump-1", { closingNozzleReadings: {}, nonSaleDispenses: [] }))
      .rejects.toThrow("Shift not found");
  });
});
