import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryForecourtConfigStore } from "@/server/repositories/forecourt-config-store";
import { createMemoryOperationsRepository } from "@/server/repositories/memory-operations-repository";

describe("today pump-shift deletion", () => {
  beforeEach(() => { globalThis.forecourtConfigStore = createMemoryForecourtConfigStore({ seedDefaults: true }); });

  it("creates a dummy entry, removes it, updates finance inputs, and leaves yesterday untouched", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const today = "2026-09-24";
    const shift = await repository.openShift({
      name: "Daily forecourt sheet", businessDate: today, staffOnDuty: ["Dummy Operator"],
      staffAssignments: [{ staffId: "dummy", staffName: "Dummy Operator", nozzleId: "a_n1" }],
      stationSnapshots: [{ stationId: "a_n1", code: "A-N1", name: "Nozzle 1", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "100", costPerLitre: "90", dispenserId: "pump-a" }],
      openingNozzleReadings: { a_n1: "100" }, openingTankStocks: { petrol_tank: "5000" }
    }, "dummy-open");

    const withYesterday = await repository.completePumpShift(shift.id, "pump-a", {
      staffId: "dummy", staffName: "Dummy Operator", nozzleIds: ["a_n1"], closingNozzleReadings: { a_n1: "105" }, nonSaleDispenses: []
    });
    await repository.updateActiveShiftDate(shift.id, { businessDate: "2026-09-23", reason: "Test previous date guard" });
    await repository.updateActiveShiftDate(shift.id, { businessDate: today, reason: "Return to today" });
    const dummy = await repository.completePumpShift(shift.id, "pump-a", {
      staffId: "dummy", staffName: "Dummy Operator", nozzleIds: ["a_n1"], closingNozzleReadings: { a_n1: "110" },
      nonSaleDispenses: [], collections: { cash: "500", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "500" }
    });
    const dummyId = dummy.pumpShiftHistory?.at(-1)?.id;
    expect(dummyId).toBeTruthy();

    const deleted = await repository.voidPumpShiftEntry(shift.id, "pump-a", dummyId!, { reason: "Dummy deletion test" }, today);

    expect(deleted.pumpShiftHistory).toHaveLength(1);
    expect(deleted.pumpShiftHistory?.[0].id).toBe(withYesterday.pumpShiftHistory?.[0].id);
    expect(deleted.pumpShiftVoids?.at(-1)).toMatchObject({ entryId: dummyId, reason: "Dummy deletion test" });
    expect((await repository.findShift(shift.id))?.pumpShiftHistory).toEqual(deleted.pumpShiftHistory);
  });
});
