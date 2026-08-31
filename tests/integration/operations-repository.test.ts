import { describe, expect, it } from "vitest";

import { createMemoryOperationsRepository } from "@/server/repositories/memory-operations-repository";

describe("MemoryOperationsRepository", () => {
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
});
