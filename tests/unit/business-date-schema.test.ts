import { describe, expect, it } from "vitest";

import { businessDate } from "@/lib/business-time";
import { activeShiftDateCorrectionSchema, attendanceSchema, openShiftSchema, tankStockAdjustmentSchema } from "@/server/http/schemas";

const future = "2999-10-24";
const futureDateIssue = expect.objectContaining({ path: ["businessDate"], message: "Business date cannot be in the future" });

describe("business date schemas", () => {
  it("accepts today and past dates for the active day", () => {
    expect(activeShiftDateCorrectionSchema.safeParse({ businessDate: businessDate() }).success).toBe(true);
    expect(activeShiftDateCorrectionSchema.safeParse({ businessDate: "2026-09-04" }).success).toBe(true);
  });

  it("rejects a future date for the active day", () => {
    const result = activeShiftDateCorrectionSchema.safeParse({ businessDate: future });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([futureDateIssue]);
  });

  it("rejects future dates when opening a day, saving attendance, or adjusting tank stock", () => {
    const opening = openShiftSchema.safeParse({ name: "Daily forecourt sheet", businessDate: future, staffOnDuty: [], openingNozzleReadings: {}, openingTankStocks: {} });
    const attendance = attendanceSchema.safeParse({ staffId: "staff-1", businessDate: future, status: "PRESENT" });
    const stock = tankStockAdjustmentSchema.safeParse({ currentStock: "100", previousStock: "90", businessDate: future, reason: "Dip check" });

    for (const result of [opening, attendance, stock]) expect(result.error?.issues).toContainEqual(futureDateIssue);
  });
});
