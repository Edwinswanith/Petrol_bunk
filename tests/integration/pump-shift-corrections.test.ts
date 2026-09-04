import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryForecourtConfigStore, getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";
import { createMemoryOperationsRepository } from "@/server/repositories/memory-operations-repository";
import { prepareCloseInput } from "@/server/services/close-input-service";
import { prepareOpenShiftInput } from "@/server/services/open-input-service";

describe("correcting a completed pump-shift entry on an open business day", () => {
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

  it("corrects a segment's closing readings and cascades into the next segment on the same pump before the day closes", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await openTodaysShift(repository);

    await repository.completePumpShift(shift.id, "pump-1", {
      staffId: "staff-kumar", staffName: "Kumar",
      closingNozzleReadings: { a_n1: "1100", a_n2: "1050", a_n3: "1080", a_n4: "1040" },
      nonSaleDispenses: [{ nozzleId: "a_n1", volume: "2", returnedToTank: true }],
      collections: { cash: "5000", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "5000" }
    });
    const afterSecond = await repository.completePumpShift(shift.id, "pump-1", {
      staffId: "staff-priya", staffName: "Priya",
      closingNozzleReadings: { a_n1: "1150", a_n2: "1100", a_n3: "1120", a_n4: "1080" }, nonSaleDispenses: []
    });
    const firstEntryId = afterSecond.pumpShiftHistory![0].id;

    const corrected = await repository.correctPumpShiftEntry(shift.id, "pump-1", firstEntryId, {
      staffId: "staff-kumar", staffName: "Kumar",
      closingNozzleReadings: { a_n1: "1120", a_n2: "1050", a_n3: "1080", a_n4: "1040" },
      nonSaleDispenses: [{ nozzleId: "a_n1", volume: "2", returnedToTank: true }],
      collections: { cash: "5000", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "5000" },
      reason: "Missed 20 litres on nozzle 1"
    });

    const [firstEntry, secondEntry] = corrected.pumpShiftHistory!;
    expect(firstEntry.closingNozzleReadings.a_n1).toBe("1120");
    expect(firstEntry.corrections).toHaveLength(1);
    expect(secondEntry.openingNozzleReadings.a_n1).toBe("1120");
    expect(secondEntry.cascadeAdjustment).toMatchObject({ fromEntryId: firstEntryId });

    const shiftAfterCorrection = await repository.findShift(shift.id);
    if (!shiftAfterCorrection) throw new Error("Shift not found");

    const closeInput = await prepareCloseInput(shiftAfterCorrection, {
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

    const closed = await repository.closeShift(shift.id, closeInput, "close-key");
    expect(closed.pumpShiftHistory?.[0].closingNozzleReadings.a_n1).toBe("1120");
    expect(closed.pumpShiftHistory?.[1].openingNozzleReadings.a_n1).toBe("1120");
  });

  it("refuses to correct a pump-shift entry on a closed business day", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await openTodaysShift(repository);
    const afterFirst = await repository.completePumpShift(shift.id, "pump-1", {
      staffId: "staff-kumar", staffName: "Kumar",
      closingNozzleReadings: { a_n1: "1100", a_n2: "1050", a_n3: "1080", a_n4: "1040" }, nonSaleDispenses: []
    });
    const entryId = afterFirst.pumpShiftHistory![0].id;

    const closeInput = await prepareCloseInput(afterFirst, {
      closingNozzleReadings: Object.fromEntries((shift.stationSnapshots ?? []).map((station) => [station.stationId, "1200"])),
      closingTankStocks: shift.openingTankStocks, nonSaleDispenses: [],
      receipts: Object.fromEntries(Object.keys(shift.openingTankStocks).map((tankId) => [tankId, "0"])),
      sideCollections: { "pump-1": { cash: "0", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "0" }, "pump-2": { cash: "0", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "0" } },
      staffHandovers: {}, lubricantRevenue: "0", lubricantCost: "0", expenses: "0", varianceExplanation: "Test closure",
      payments: { cashSales: "0", upi: "0", card: "0", credit: "0", other: "0", cashReceipts: "0", cashExpenses: "0", cashRemovals: "0", declaredCashHandover: "0" }
    });
    await repository.closeShift(shift.id, closeInput, "close-key");

    await expect(repository.correctPumpShiftEntry(shift.id, "pump-1", entryId, {
      staffId: "staff-kumar", staffName: "Kumar", closingNozzleReadings: { a_n1: "1120", a_n2: "1050", a_n3: "1080", a_n4: "1040" },
      nonSaleDispenses: [], reason: "Too late"
    })).rejects.toThrow("Closed shifts are immutable in v1");
  });

  it("refuses to correct an entry on a shift that does not exist", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    await expect(repository.correctPumpShiftEntry("missing-shift", "pump-1", "missing-entry", {
      staffId: "staff-kumar", staffName: "Kumar", closingNozzleReadings: {}, nonSaleDispenses: [], reason: "Does not exist"
    })).rejects.toThrow("Shift not found");
  });

  it("refuses to correct a missing pump-shift entry", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await openTodaysShift(repository);

    await expect(repository.correctPumpShiftEntry(shift.id, "pump-1", "missing-entry", {
      staffId: "staff-kumar", staffName: "Kumar",
      closingNozzleReadings: { a_n1: "1100", a_n2: "1050", a_n3: "1080", a_n4: "1040" }, nonSaleDispenses: [], reason: "Does not exist"
    })).rejects.toThrow("Pump shift record not found");
  });
});
