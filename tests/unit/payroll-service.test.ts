import { describe, expect, it } from "vitest";

import { calculatePayrollSettlement } from "@/server/services/payroll-service";

describe("calculatePayrollSettlement", () => {
  it("keeps attendance counts auditable and calculates owner-entered payroll adjustments", () => {
    expect(calculatePayrollSettlement({ baseSalary: "18000", dailyBetaRate: "150", eligibleBetaDays: 30, halfDays: 1, overtime: "1500", attendanceDeduction: "900", advances: "2000", otherDeductions: "100", amountPaid: "10000" })).toEqual({ dailyBetaRate: "150.00", betaDays: 29.5, betaEarned: "4425.00", grossPay: "23925.00", totalDeductions: "3000.00", netPay: "20925.00", amountPaid: "10000.00", balanceDue: "10925.00" });
  });

  it("does not add beta for leave or absence days and rejects too many half days", () => {
    expect(calculatePayrollSettlement({ baseSalary: "18000", dailyBetaRate: "150", eligibleBetaDays: 0, halfDays: 0, overtime: "0", attendanceDeduction: "0", advances: "0", otherDeductions: "0", amountPaid: "0" }).betaEarned).toBe("0.00");
    expect(() => calculatePayrollSettlement({ baseSalary: "18000", dailyBetaRate: "150", eligibleBetaDays: 1, halfDays: 2, overtime: "0", attendanceDeduction: "0", advances: "0", otherDeductions: "0", amountPaid: "0" })).toThrow("Half days cannot exceed worked attendance days");
  });

  it("rejects paying more than the calculated net salary", () => {
    expect(() => calculatePayrollSettlement({ baseSalary: "1000", dailyBetaRate: "0", eligibleBetaDays: 0, halfDays: 0, overtime: "0", attendanceDeduction: "0", advances: "0", otherDeductions: "0", amountPaid: "1001" })).toThrow("Amount paid cannot exceed net salary");
  });

  it("rejects invalid attendance counts, negative money and deductions above gross pay", () => {
    const valid = { baseSalary: "1000", dailyBetaRate: "0", eligibleBetaDays: 0, halfDays: 0, overtime: "0", attendanceDeduction: "0", advances: "0", otherDeductions: "0", amountPaid: "0" };
    expect(() => calculatePayrollSettlement({ ...valid, eligibleBetaDays: 0.5 })).toThrow("Eligible beta days must be a non-negative whole number");
    expect(() => calculatePayrollSettlement({ ...valid, halfDays: -1 })).toThrow("Half days must be a non-negative whole number");
    expect(() => calculatePayrollSettlement({ ...valid, dailyBetaRate: "-1" })).toThrow("dailyBetaRate cannot be negative");
    expect(() => calculatePayrollSettlement({ ...valid, attendanceDeduction: "1001" })).toThrow("Deductions cannot exceed gross salary");
  });
});
