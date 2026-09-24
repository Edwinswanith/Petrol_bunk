import { describe, expect, it } from "vitest";

import type { PumpShiftRecord, ShiftRecord } from "@/server/domain/operations";
import { applyPumpShiftEntryVoid } from "@/server/services/pump-shift-void-service";

const collections = { cash: "100", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "100" };

function entry(id: string, businessDate = "2026-09-24", pumpId = "pump-a"): PumpShiftRecord {
  return {
    id, pumpId, pumpLabel: "Pump A", staffId: "arun", staffName: "Arun", nozzleIds: ["a_n1"], businessDate,
    shiftStartTime: "06:00", shiftEndTime: "14:00", openingNozzleReadings: { a_n1: "100" },
    closingNozzleReadings: { a_n1: "110" }, nonSaleDispenses: [], collections,
    litresSold: "10.000", expectedSalesValue: "100.00", accountedTender: "100.00", tenderVariance: "0.00",
    declaredCashHandover: "100.00", cashVariance: "0.00", products: [], nozzles: {}, completedAt: "2026-09-24T08:00:00.000Z"
  };
}

function shift(overrides: Partial<ShiftRecord> = {}): ShiftRecord {
  return {
    id: "shift-1", state: "OPEN", name: "Daily", businessDate: "2026-09-24", staffOnDuty: ["Arun"],
    openingNozzleReadings: { a_n1: "100" }, openingTankStocks: {}, createdAt: "2026-09-24T00:00:00.000Z",
    startedAt: "2026-09-24T00:00:00.000Z", version: 3, pumpShiftHistory: [entry("today-entry")],
    ...overrides
  };
}

describe("applyPumpShiftEntryVoid", () => {
  it("removes a current-day entry from active history and preserves an auditable copy", () => {
    const previous = entry("previous-entry", "2026-09-23");
    const current = entry("today-entry");
    const original = shift({ pumpShiftHistory: [previous, current] });

    const updated = applyPumpShiftEntryVoid(
      original, "pump-a", "today-entry", { reason: "Duplicate employee entry" }, "2026-09-24", "2026-09-24T10:00:00.000Z"
    );

    expect(updated.pumpShiftHistory).toEqual([previous]);
    expect(updated.pumpShiftVoids).toEqual([expect.objectContaining({
      id: expect.any(String), entryId: "today-entry", pumpId: "pump-a", businessDate: "2026-09-24",
      reason: "Duplicate employee entry", voidedAt: "2026-09-24T10:00:00.000Z", entry: current
    })]);
    expect(updated.version).toBe(4);
    expect(original.pumpShiftHistory).toHaveLength(2);
  });

  it("rejects deletion when the active shift is not on the current business date", () => {
    expect(() => applyPumpShiftEntryVoid(
      shift({ businessDate: "2026-09-23" }), "pump-a", "today-entry", { reason: "Duplicate" }, "2026-09-24"
    )).toThrow("Only entries from today's open business date can be deleted");
  });

  it("rejects a previous-date entry even when the active shift has moved to today", () => {
    const previous = entry("previous-entry", "2026-09-23");
    expect(() => applyPumpShiftEntryVoid(
      shift({ pumpShiftHistory: [previous] }), "pump-a", previous.id, { reason: "Wrong entry" }, "2026-09-24"
    )).toThrow("Only entries from today's open business date can be deleted");
  });

  it("rejects closed shifts and mismatched pumps", () => {
    expect(() => applyPumpShiftEntryVoid(
      shift({ state: "CLOSED" }), "pump-a", "today-entry", { reason: "Duplicate" }, "2026-09-24"
    )).toThrow("Closed shifts are immutable in v1");
    expect(() => applyPumpShiftEntryVoid(
      shift(), "pump-b", "today-entry", { reason: "Duplicate" }, "2026-09-24"
    )).toThrow("Pump shift record not found");
  });

  it("requires an audit reason even when called outside the HTTP schema", () => {
    expect(() => applyPumpShiftEntryVoid(
      shift(), "pump-a", "today-entry", { reason: " " }, "2026-09-24"
    )).toThrow("Enter a reason before deleting this entry");
  });
});
