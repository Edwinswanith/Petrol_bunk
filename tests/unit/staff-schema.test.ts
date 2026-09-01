import { describe, expect, it } from "vitest";

import { openShiftSchema, staffSchema, staffUpdateSchema } from "@/server/http/schemas";

const baseShift = {
  name: "Morning shift",
  businessDate: "2026-08-31",
  staffOnDuty: ["Arun", "Priya"],
  openingNozzleReadings: { petrol_1: "1000", diesel_1: "2000" },
  openingTankStocks: { petrol_tank: "5000", diesel_tank: "5000" }
};

describe("shift staff assignments", () => {
  it("accepts one staff member per machine", () => {
    const parsed = openShiftSchema.parse({
      ...baseShift,
      staffAssignments: [
        { staffId: "staff-arun", staffName: "Arun", nozzleId: "petrol_1" },
        { staffId: "staff-priya", staffName: "Priya", nozzleId: "diesel_1" }
      ]
    });
    expect(parsed.staffAssignments).toHaveLength(2);
  });

  it("allows one staff member to operate multiple machines but keeps each machine unique", () => {
    expect(openShiftSchema.parse({
      ...baseShift,
      staffAssignments: [
        { staffId: "staff-arun", staffName: "Arun", nozzleId: "petrol_1" },
        { staffId: "staff-arun", staffName: "Arun", nozzleId: "diesel_1" }
      ]
    }).staffAssignments).toHaveLength(2);
    expect(() => openShiftSchema.parse({
      ...baseShift,
      staffAssignments: [
        { staffId: "staff-arun", staffName: "Arun", nozzleId: "petrol_1" },
        { staffId: "staff-priya", staffName: "Priya", nozzleId: "petrol_1" }
      ]
    })).toThrow();
  });
});

describe("staff salary", () => {
  it("stores a non-negative monthly salary and defaults older additions to zero", () => {
    expect(staffSchema.parse({ name: "Edwin" }).monthlySalary).toBe("0");
    expect(staffSchema.parse({ name: "Edwin", monthlySalary: "18000" }).monthlySalary).toBe("18000");
    expect(() => staffUpdateSchema.parse({ monthlySalary: "-1" })).toThrow();
  });
});
