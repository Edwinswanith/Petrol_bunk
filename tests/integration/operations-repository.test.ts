import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryOperationsRepository } from "@/server/repositories/memory-operations-repository";
import { createMemoryForecourtConfigStore, getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

describe("MemoryOperationsRepository", () => {
  beforeEach(() => {
    globalThis.forecourtConfigStore = createMemoryForecourtConfigStore({ seedDefaults: true });
  });

  it("records an auditable manual tank stock adjustment", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });

    const movement = await repository.adjustTankStock({
      tankId: "petrol_tank",
      currentStock: "15000",
      previousStock: "12460",
      businessDate: "2026-09-02",
      reason: "Opening physical dip"
    });

    const configuration = await getForecourtConfigStore().getConfiguration();
    expect(configuration.tanks.find((tank) => tank.id === "petrol_tank")?.currentStock).toBe("15000.000");
    expect(movement).toMatchObject({
      tankId: "petrol_tank",
      type: "ADJUSTMENT",
      quantity: "2540.000",
      balanceAfter: "15000.000",
      businessDate: "2026-09-02",
      referenceLabel: "Manual stock adjustment · Opening physical dip"
    });
    expect(await repository.listInventoryMovements("petrol_tank")).toEqual([movement]);
  });

  it("rejects a manual stock adjustment above capacity or based on stale stock", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const base = { tankId: "diesel_tank", businessDate: "2026-09-02", reason: "Opening physical dip" };

    await expect(repository.adjustTankStock({ ...base, currentStock: "21000", previousStock: "9002.985" }))
      .rejects.toThrow("Stock cannot exceed the 20000 litre tank capacity");
    await expect(repository.adjustTankStock({ ...base, currentStock: "10000", previousStock: "8000" }))
      .rejects.toThrow("Tank stock changed on another device. Refresh and try again.");
    expect(await repository.listInventoryMovements()).toHaveLength(0);
  });

  it("opens a shift idempotently", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const input = {
      name: "Evening shift",
      businessDate: "2026-08-31",
      staffOnDuty: ["Kumar", "Ravi"],
      openingNozzleReadings: { petrol_1: "182350.250", diesel_1: "92540.000" },
      openingTankStocks: { petrol_tank: "12450", diesel_tank: "8200" }
    };

    const first = await repository.openShift(input, "open-evening-1");
    const replay = await repository.openShift(input, "open-evening-1");

    expect(replay.id).toBe(first.id);
    expect((await repository.listShifts()).length).toBe(1);
  });

  it("allows only one active shift at a time", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const input = {
      name: "Evening shift",
      businessDate: "2026-08-31",
      staffOnDuty: [],
      openingNozzleReadings: { petrol_1: "1000", diesel_1: "2000" },
      openingTankStocks: { petrol_tank: "5000", diesel_tank: "6000" }
    };

    await repository.openShift(input, "open-1");
    await expect(repository.openShift(input, "open-2")).rejects.toThrow(
      "Close the active shift before opening another"
    );
  });

  it("closes a shift once and returns canonical reconciliation", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await repository.openShift(
      {
        name: "Evening shift",
        businessDate: "2026-08-31",
        staffOnDuty: ["Kumar"],
        openingNozzleReadings: { petrol_1: "1000", diesel_1: "2000" },
        openingTankStocks: { petrol_tank: "5000", diesel_tank: "6000" }
      },
      "open-1"
    );

    const closed = await repository.closeShift(
      shift.id,
      {
        closingNozzleReadings: { petrol_1: "1100", diesel_1: "2100" },
        closingTankStocks: { petrol_tank: "4898", diesel_tank: "5902" },
        nonSaleDispenses: [],
        receipts: { petrol_tank: "0", diesel_tank: "0" },
        payments: {
          cashSales: "10000",
          upi: "10300",
          card: "0",
          credit: "0",
          other: "0",
          cashReceipts: "0",
          cashExpenses: "0",
          cashRemovals: "0",
          declaredCashHandover: "10000"
        },
        lubricantRevenue: "0",
        lubricantCost: "0",
        expenses: "0",
        varianceExplanation: "Two litre physical dip difference across tanks."
      },
      "close-1"
    );

    expect(closed.state).toBe("CLOSED");
    expect(closed.reconciliation?.sales.expectedSales).toBe("20300.00");
    expect(closed.reconciliation?.tanks.petrol_tank.variance).toBe("-2.000");
    expect(closed.reconciliation?.tanks.diesel_tank.variance).toBe("2.000");

    const replay = await repository.closeShift(
      shift.id,
      {
        closingNozzleReadings: { petrol_1: "1100", diesel_1: "2100" },
        closingTankStocks: { petrol_tank: "4898", diesel_tank: "5902" },
        nonSaleDispenses: [],
        receipts: { petrol_tank: "0", diesel_tank: "0" },
        payments: {
          cashSales: "10000",
          upi: "10300",
          card: "0",
          credit: "0",
          other: "0",
          cashReceipts: "0",
          cashExpenses: "0",
          cashRemovals: "0",
          declaredCashHandover: "10000"
        },
        lubricantRevenue: "0",
        lubricantCost: "0",
        expenses: "0"
      },
      "close-1"
    );
    expect(replay.id).toBe(closed.id);
    expect(replay.closingInput?.closingNozzleReadings.petrol_1).toBe("1100");
    await expect(repository.closeShift(shift.id, replay.closingInput!, "close-2")).rejects.toThrow(
      "Shift is already closed"
    );
  });

  it("does not allow a closed shift opening value to be overwritten", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: true });
    const closed = (await repository.listShifts()).find((shift) => shift.state === "CLOSED");

    expect(closed).toBeDefined();
    await expect(
      repository.updateOpeningReading(closed!.id, "petrol_1", "1")
    ).rejects.toThrow("Closed shifts are immutable in v1");
  });

  it("updates an open reading and handles missing records", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    expect(await repository.findShift("missing")).toBeNull();
    await expect(repository.updateOpeningReading("missing", "petrol_1", "1")).rejects.toThrow(
      "Shift not found"
    );
    await expect(
      repository.closeShift("missing", {} as never, "missing-close")
    ).rejects.toThrow("Shift not found");

    const shift = await repository.openShift(
      {
        name: "Morning shift",
        businessDate: "2026-08-31",
        staffOnDuty: [],
        openingNozzleReadings: { petrol_1: "100", diesel_1: "200" },
        openingTankStocks: { petrol_tank: "1000", diesel_tank: "2000" }
      },
      "open-update"
    );
    const updated = await repository.updateOpeningReading(shift.id, "petrol_1", "101");
    expect(updated.openingNozzleReadings.petrol_1).toBe("101");
    expect(updated.version).toBe(2);
  });

  it("corrects active-day opening readings and operator assignments but protects closed records", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await repository.openShift({ name: "Daily forecourt sheet", businessDate: "2026-09-01", staffOnDuty: ["Edwin"], staffAssignments: [{ staffId: "edwin", staffName: "Edwin", nozzleId: "petrol_1" }], openingNozzleReadings: { petrol_1: "100" }, openingTankStocks: { petrol_tank: "1000" } }, "correction-open");
    const corrected = await repository.updateActiveShift(shift.id, { openingNozzleReadings: { petrol_1: "105" }, staffAssignments: [{ staffId: "priya", staffName: "Priya", nozzleId: "petrol_1" }] });
    expect(corrected).toEqual(expect.objectContaining({ openingNozzleReadings: { petrol_1: "105" }, staffOnDuty: ["Priya"], version: 2 }));
  });

  it("updates active-day reseller/customer rates and records correction history", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await repository.openShift({ name: "Daily forecourt sheet", businessDate: "2026-09-01", staffOnDuty: ["Arun"], staffAssignments: [{ staffId: "arun", staffName: "Arun", nozzleId: "a_n1" }], stationSnapshots: [{ stationId: "a_n1", code: "A-N1", name: "Nozzle 1", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "102.50", costPerLitre: "96.80" }], openingNozzleReadings: { a_n1: "1000" }, openingTankStocks: { petrol_tank: "5000" } }, "rate-open");
    const corrected = await repository.updateActiveShift(shift.id, { openingNozzleReadings: { a_n1: "1005" }, staffAssignments: [{ staffId: "priya", staffName: "Priya", nozzleId: "a_n1" }], productRates: { petrol: { sellingPricePerLitre: "104", costPricePerLitre: "97" } }, reason: "Corrected morning sheet" } as never);
    expect(corrected.stationSnapshots?.[0]).toEqual(expect.objectContaining({ pricePerLitre: "104", costPerLitre: "97" }));
    expect(corrected.corrections).toEqual([expect.objectContaining({ reason: "Corrected morning sheet" })]);
  });

  it("updates only a fuel's price via the dedicated price-only endpoint, without needing valid opening readings or staff assignments", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await repository.openShift({ name: "Daily forecourt sheet", businessDate: "2026-09-01", staffOnDuty: ["Arun"], staffAssignments: [{ staffId: "arun", staffName: "Arun", nozzleId: "a_n1" }], stationSnapshots: [{ stationId: "a_n1", code: "A-N1", name: "Nozzle 1", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "102.50", costPerLitre: "96.80" }], openingNozzleReadings: { a_n1: "1000" }, openingTankStocks: { petrol_tank: "5000" } }, "price-open");

    const corrected = await repository.updateActiveShiftPrices(shift.id, { productRates: { petrol: { sellingPricePerLitre: "108.17", costPricePerLitre: "96.80" } }, reason: "Owner revised petrol price" });

    expect(corrected.stationSnapshots?.[0]).toEqual(expect.objectContaining({ pricePerLitre: "108.17", costPerLitre: "96.80" }));
    expect(corrected.openingNozzleReadings).toEqual(shift.openingNozzleReadings);
    expect(corrected.staffAssignments).toEqual(shift.staffAssignments);
    expect(corrected.corrections).toEqual([expect.objectContaining({ reason: "Owner revised petrol price" })]);
  });

  it("deducts aggregated station outflow from tank inventory once when a shift closes", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await repository.openShift({
      name: "Morning shift",
      businessDate: "2026-09-01",
      staffOnDuty: ["Arun"],
      stationSnapshots: [
        { stationId: "petrol_1", code: "P1", name: "Petrol 1", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "100", costPerLitre: "95" },
        { stationId: "petrol_2", code: "P2", name: "Petrol 2", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "100", costPerLitre: "95" }
      ],
      tankSnapshots: [
        { tankId: "petrol_tank", code: "PT1", name: "Petrol Tank", productId: "petrol", productName: "Petrol", capacityLitres: "20000" }
      ],
      openingNozzleReadings: { petrol_1: "1000", petrol_2: "2000" },
      openingTankStocks: { petrol_tank: "5000" }
    }, "inventory-open");
    const input = {
      closingNozzleReadings: { petrol_1: "1100", petrol_2: "2050" },
      closingTankStocks: { petrol_tank: "4850" },
      nonSaleDispenses: [],
      receipts: { petrol_tank: "0" },
      payments: { cashSales: "15000", upi: "0", card: "0", credit: "0", other: "0", cashReceipts: "0", cashExpenses: "0", cashRemovals: "0", declaredCashHandover: "15000" },
      lubricantRevenue: "0", lubricantCost: "0", expenses: "0"
    };

    await repository.closeShift(shift.id, input, "inventory-close");
    await repository.closeShift(shift.id, input, "inventory-close");

    expect(await repository.getTankBalances()).toEqual({ petrol_tank: "4850.000" });
    const movements = (await repository.listInventoryMovements("petrol_tank")).filter((movement) => movement.type === "SHIFT_DISPENSE");
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: "SHIFT_DISPENSE", quantity: "-150.000", referenceId: shift.id, balanceAfter: "4850.000" });
  });

  it("requires an explanation before closing a materially unbalanced shift", async () => {
    const repository = createMemoryOperationsRepository({ seedDemoData: false });
    const shift = await repository.openShift({
      name: "Morning shift", businessDate: "2026-09-01", staffOnDuty: [],
      openingNozzleReadings: { petrol_1: "1000", diesel_1: "2000" },
      openingTankStocks: { petrol_tank: "5000", diesel_tank: "6000" }
    }, "variance-open");
    await expect(repository.closeShift(shift.id, {
      closingNozzleReadings: { petrol_1: "1100", diesel_1: "2000" },
      closingTankStocks: { petrol_tank: "4890", diesel_tank: "6000" },
      nonSaleDispenses: [], receipts: { petrol_tank: "0", diesel_tank: "0" },
      payments: { cashSales: "10000", upi: "0", card: "0", credit: "0", other: "0", cashReceipts: "0", cashExpenses: "0", cashRemovals: "0", declaredCashHandover: "10000" },
      lubricantRevenue: "0", lubricantCost: "0", expenses: "0"
    }, "variance-close")).rejects.toThrow("Explain the payment or tank variance before closing the shift");
    expect((await repository.findShift(shift.id))?.state).toBe("OPEN");
    expect(await repository.listInventoryMovements()).toHaveLength(0);
  });
});
