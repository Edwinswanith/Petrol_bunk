import { describe, expect, it } from "vitest";

import { tankStockAdjustmentSchema } from "@/server/http/schemas";

describe("tankStockAdjustmentSchema", () => {
  it("accepts a dated, explained stock adjustment", () => {
    expect(tankStockAdjustmentSchema.parse({
      currentStock: "14500.250",
      previousStock: "12460",
      businessDate: "2026-09-02",
      reason: "  First physical dip  "
    })).toEqual({
      currentStock: "14500.250",
      previousStock: "12460",
      businessDate: "2026-09-02",
      reason: "First physical dip"
    });
  });

  it("rejects negative stock and unexplained edits", () => {
    expect(tankStockAdjustmentSchema.safeParse({
      currentStock: "-1",
      previousStock: "0",
      businessDate: "2026-09-02",
      reason: "Opening"
    }).success).toBe(false);
    expect(tankStockAdjustmentSchema.safeParse({
      currentStock: "1000",
      previousStock: "0",
      businessDate: "2026-09-02",
      reason: ""
    }).success).toBe(false);
  });
});
