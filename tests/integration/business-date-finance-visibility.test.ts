import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryForecourtConfigStore, getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";
import { createMemoryOperationsRepository } from "@/server/repositories/memory-operations-repository";
import { buildFinanceAnalytics } from "@/server/services/finance-analytics-service";
import { prepareOpenShiftInput } from "@/server/services/open-input-service";

describe("pump entries saved after a business date change", () => {
  beforeEach(() => {
    globalThis.forecourtConfigStore = createMemoryForecourtConfigStore({ seedDefaults: true });
  });

  async function openShift(repository: ReturnType<typeof createMemoryOperationsRepository>) {
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

  const completePumpOne = (repository: ReturnType<typeof createMemoryOperationsRepository>, shiftId: string) =>
    repository.completePumpShift(shiftId, "pump-1", {
      staffId: "staff-kumar", staffName: "Kumar",
      closingNozzleReadings: { a_n1: "1100", a_n2: "1050", a_n3: "1080", a_n4: "1040" }, nonSaleDispenses: []
    });

  const finance = (month: string, shifts: Awaited<ReturnType<typeof completePumpOne>>[]) =>
    buildFinanceAnalytics({ month, shifts, expenses: [], staff: [] });

  it("shows the entry in the Finance month of the corrected date", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await openShift(repository);

    await repository.updateActiveShiftDate(shift.id, { businessDate: "2026-09-05" });
    const saved = await completePumpOne(repository, shift.id);

    expect(saved.pumpShiftHistory?.[0].businessDate).toBe("2026-09-05");
    expect(finance("2026-09", [saved]).pumpShifts.map((entry) => entry.businessDate)).toEqual(["2026-09-05"]);
    expect(finance("2026-10", [saved]).pumpShifts).toEqual([]);
  });

  it("rejects a future date so later entries stay in the current Finance month", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await openShift(repository);

    await expect(repository.updateActiveShiftDate(shift.id, { businessDate: "2999-10-24" })).rejects.toThrow("Business date cannot be in the future");
    const saved = await completePumpOne(repository, shift.id);

    expect(saved.businessDate).toBe("2026-09-04");
    expect(finance("2026-09", [saved]).pumpShifts.map((entry) => entry.businessDate)).toEqual(["2026-09-04"]);
  });
});
