import { describe, expect, it } from "vitest";

import { tankFillLevel } from "@/server/services/tank-fill-level";

describe("tankFillLevel", () => {
  it("computes the fill percentage of current stock against tank capacity", () => {
    expect(tankFillLevel("10000", "20000")).toEqual({ percentage: 50, status: "healthy" });
  });

  it("flags critical status at or below 20% full", () => {
    expect(tankFillLevel("4000", "20000")).toEqual({ percentage: 20, status: "critical" });
  });

  it("flags watch status between 21% and 45% full", () => {
    expect(tankFillLevel("9000", "20000")).toEqual({ percentage: 45, status: "watch" });
  });

  it("clamps a stock reading above capacity to 100%", () => {
    expect(tankFillLevel("25000", "20000")).toEqual({ percentage: 100, status: "healthy" });
  });

  it("clamps a negative stock reading to 0%", () => {
    expect(tankFillLevel("-50", "20000")).toEqual({ percentage: 0, status: "critical" });
  });

  it("treats a zero or missing capacity as empty rather than dividing by zero", () => {
    expect(tankFillLevel("500", "0")).toEqual({ percentage: 0, status: "critical" });
  });
});
