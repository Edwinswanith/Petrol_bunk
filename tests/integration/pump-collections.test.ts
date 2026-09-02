import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryForecourtConfigStore, getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";
import { createMemoryOperationsRepository } from "@/server/repositories/memory-operations-repository";
import { prepareCloseInput } from "@/server/services/close-input-service";
import { prepareOpenShiftInput } from "@/server/services/open-input-service";
import { reconcileShift } from "@/server/services/shift-reconciliation-service";

const ATTENDANT = { "pump-1": { staffId: "staff-kumar", staffName: "Kumar" }, "pump-2": { staffId: "staff-arun", staffName: "Arun" } } as const;

describe("one attendant and one collection per pump", () => {
  beforeEach(() => {
    globalThis.forecourtConfigStore = createMemoryForecourtConfigStore({ seedDefaults: true });
  });

  it("carries a pump-level entry through open, close preparation and reconciliation", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const configuration = await getForecourtConfigStore().getConfiguration();
    const stations = configuration.stations.filter((station) => station.active);
    const pumpOf = (station: (typeof stations)[number]) => station.dispenserId as keyof typeof ATTENDANT;

    const prepared = await prepareOpenShiftInput({
      name: "Daily forecourt sheet", businessDate: "2026-09-02", staffOnDuty: ["Kumar", "Arun"],
      staffAssignments: stations.map((station) => ({ ...ATTENDANT[pumpOf(station)], nozzleId: station.id })),
      openingNozzleReadings: Object.fromEntries(stations.map((station) => [station.id, "1000"])),
      openingTankStocks: Object.fromEntries(configuration.tanks.filter((tank) => tank.active).map((tank) => [tank.id, tank.currentStock]))
    });
    const shift = await repository.openShift(prepared, "open-key");

    // One litre through every nozzle, so each pump owes the price of its four nozzles.
    const owed: Record<string, number> = {};
    const drawn: Record<string, number> = {};
    for (const snapshot of shift.stationSnapshots ?? []) {
      owed[snapshot.dispenserId!] = (owed[snapshot.dispenserId!] ?? 0) + Number(snapshot.pricePerLitre);
      drawn[snapshot.tankId] = (drawn[snapshot.tankId] ?? 0) + 1;
    }
    const collected = (pumpId: string) => ({ cash: owed[pumpId].toFixed(2), upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: owed[pumpId].toFixed(2) });
    const total = Object.values(owed).reduce((sum, value) => sum + value, 0);

    const closeInput = await prepareCloseInput(shift, {
      closingNozzleReadings: Object.fromEntries(stations.map((station) => [station.id, "1001"])),
      closingTankStocks: Object.fromEntries(Object.entries(shift.openingTankStocks).map(([tankId, stock]) => [tankId, (Number(stock) - (drawn[tankId] ?? 0)).toFixed(3)])),
      nonSaleDispenses: [], receipts: Object.fromEntries(Object.keys(shift.openingTankStocks).map((tankId) => [tankId, "0"])),
      sideCollections: { "pump-1": collected("pump-1"), "pump-2": collected("pump-2") },
      staffHandovers: {}, lubricantRevenue: "0", lubricantCost: "0", expenses: "0",
      payments: { cashSales: "0", upi: "0", card: "0", credit: "0", other: "0", cashReceipts: "0", cashExpenses: "0", cashRemovals: "0", declaredCashHandover: "0" }
    });

    // The canonical totals are rebuilt from the two pump entries, not trusted from the client.
    expect(Number(closeInput.payments.cashSales)).toBe(total);
    expect(Number(closeInput.staffHandovers?.["staff-kumar"])).toBe(owed["pump-1"]);
    expect(Number(closeInput.staffHandovers?.["staff-arun"])).toBe(owed["pump-2"]);

    const reconciliation = reconcileShift(shift, closeInput);
    expect(reconciliation.sides).toHaveLength(2);
    expect(reconciliation.sides?.map((group) => [group.sideId, group.sideLabel, group.staffName, group.nozzleIds.length, group.tenderVariance])).toEqual([
      ["pump-1", "Pump 1", "Kumar", 4, "0.00"],
      ["pump-2", "Pump 2", "Arun", 4, "0.00"]
    ]);
    expect(reconciliation.sales.tenderVariance).toBe("0.00");
  });

  it("rejects a shift where one pump is worked by two employees", async () => {
    const configuration = await getForecourtConfigStore().getConfiguration();
    const stations = configuration.stations.filter((station) => station.active);

    await expect(prepareOpenShiftInput({
      name: "Daily forecourt sheet", businessDate: "2026-09-02", staffOnDuty: [],
      staffAssignments: stations.map((station, index) => ({ staffId: index === 0 ? "staff-other" : `staff-${station.dispenserId}`, staffName: "Someone", nozzleId: station.id })),
      openingNozzleReadings: Object.fromEntries(stations.map((station) => [station.id, "1000"])),
      openingTankStocks: Object.fromEntries(configuration.tanks.filter((tank) => tank.active).map((tank) => [tank.id, tank.currentStock]))
    })).rejects.toThrow("Assign one operator to every nozzle on Pump 1");
  });
});
