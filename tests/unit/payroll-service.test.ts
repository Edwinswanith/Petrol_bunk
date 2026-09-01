import { describe, expect, it } from "vitest";

import { calculatePayrollSettlement } from "@/server/services/payroll-service";

describe("calculatePayrollSettlement", () => {
  it("keeps attendance counts auditable and calculates owner-entered payroll adjustments", () => {
    expect(calculatePayrollSettlement({ baseSalary: "18000", overtime: "1500", attendanceDeduction: "900", advances: "2000", otherDeductions: "100", amountPaid: "10000" })).toEqual({ grossPay: "19500.00", totalDeductions: "3000.00", netPay: "16500.00", amountPaid: "10000.00", balanceDue: "6500.00" });
  });

  it("rejects paying more than the calculated net salary", () => {
    expect(() => calculatePayrollSettlement({ baseSalary: "1000", overtime: "0", attendanceDeduction: "0", advances: "0", otherDeductions: "0", amountPaid: "1001" })).toThrow("Amount paid cannot exceed net salary");
  });
});
