import { describe, expect, it } from "vitest";
import type { ShiftRecord } from "@/server/domain/operations";
import { deriveOpeningCarryForward } from "@/server/services/opening-carry-forward-service";

const closed = (id: string, date: string, readings: Record<string, string>): ShiftRecord => ({
  id, state: "CLOSED", name: "Daily forecourt sheet", businessDate: date, staffOnDuty: [],
  openingNozzleReadings: {}, openingTankStocks: {}, closingNozzleReadings: readings,
  createdAt: `${date}T00:00:00.000Z`, startedAt: `${date}T00:00:00.000Z`, closedAt: `${date}T12:00:00.000Z`, version: 2
});

describe("deriveOpeningCarryForward", () => {
  it("takes each nozzle from its most recent closed day and preserves the source", () => {
    const result = deriveOpeningCarryForward([
      closed("new", "2026-09-02", { a_n1: "1500.000" }),
      closed("old", "2026-09-01", { a_n1: "1400.000", a_n2: "2200.000" })
    ], ["a_n1", "a_n2", "a_n3"]);
    expect(result).toEqual({
      readings: { a_n1: "1500.000", a_n2: "2200.000" },
      sources: { a_n1: { shiftId: "new", businessDate: "2026-09-02" }, a_n2: { shiftId: "old", businessDate: "2026-09-01" } }
    });
  });
});
