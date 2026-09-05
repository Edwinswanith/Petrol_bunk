import { describe, expect, it } from "vitest";

import type { ShiftRecord } from "@/server/domain/operations";
import type { StaffRecord } from "@/server/domain/staff";
import type { ExpenseRecord } from "@/server/repositories/journal-store";
import { buildFinanceAnalytics } from "@/server/services/finance-analytics-service";

const staff: StaffRecord[] = [
  { id: "edwin", name: "Edwin", phone: "", note: "", monthlySalary: "15000", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
  { id: "priya", name: "Priya", phone: "", note: "", monthlySalary: "12000", active: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" }
];

const shift: ShiftRecord = {
  id: "may-01", state: "CLOSED", name: "Daily forecourt sheet", businessDate: "2026-05-01", staffOnDuty: ["Edwin", "Priya"],
  staffAssignments: [
    { staffId: "edwin", staffName: "Edwin", nozzleId: "a_n1" },
    { staffId: "priya", staffName: "Priya", nozzleId: "a_n3" }
  ],
  stationSnapshots: [
    { stationId: "a_n1", code: "A-N1", name: "Nozzle 1", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol tank", pricePerLitre: "100", costPerLitre: "90", sideId: "A-S1" },
    { stationId: "a_n3", code: "A-N3", name: "Nozzle 3", productId: "diesel", productName: "Diesel", tankId: "diesel_tank", tankName: "Diesel tank", pricePerLitre: "90", costPerLitre: "80", sideId: "A-S2" }
  ],
  openingNozzleReadings: { a_n1: "1000", a_n3: "2000" }, openingTankStocks: { petrol_tank: "5000", diesel_tank: "5000" },
  closingNozzleReadings: { a_n1: "1100", a_n3: "2050" }, closingTankStocks: { petrol_tank: "4900", diesel_tank: "4950" },
  createdAt: "2026-05-01T00:00:00.000Z", startedAt: "2026-05-01T00:00:00.000Z", closedAt: "2026-05-01T08:00:00.000Z", version: 2,
  reconciliation: {
    nozzles: {
      a_n1: { meteredVolume: "100.000", customerSalesVolume: "100.000", expectedTankOutflow: "100.000", revenue: "10000.00" },
      a_n3: { meteredVolume: "50.000", customerSalesVolume: "50.000", expectedTankOutflow: "50.000", revenue: "4500.00" }
    },
    tanks: {}, sales: { expectedSales: "14500.00", accountedTender: "14500.00", tenderVariance: "0.00", expectedCashHandover: "5000.00", cashVariance: "0.00" },
    grossMargin: "1500.00", estimatedOperatingProfit: "1500.00"
  }
};

const expense = (category: ExpenseRecord["category"], amount: string): ExpenseRecord => ({
  id: `${category}-${amount}`, category, amount, paymentMethod: "cash", date: "2026-05-01", note: `${category} expense`, createdAt: "2026-05-01T09:00:00.000Z", idempotencyKey: `${category}-${amount}`
});

function pumpShiftEntry(overrides: Partial<NonNullable<ShiftRecord["pumpShiftHistory"]>[number]> = {}): NonNullable<ShiftRecord["pumpShiftHistory"]>[number] {
  return {
    id: "seg-1", pumpId: "pump-a", pumpLabel: "Pump A", staffId: "edwin", staffName: "Edwin", businessDate: "2026-05-01",
    openingNozzleReadings: { a_n1: "1000" }, closingNozzleReadings: { a_n1: "1100" }, nonSaleDispenses: [],
    collections: { cash: "10000", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "10000" },
    litresSold: "100.000", expectedSalesValue: "10000.00", accountedTender: "10000.00", tenderVariance: "0.00",
    declaredCashHandover: "10000.00", cashVariance: "0.00",
    products: [{ productId: "petrol", productName: "Petrol", litresSold: "100.000", revenue: "10000.00", grossProfit: "1000.00" }],
    nozzles: { a_n1: { meteredVolume: "100.000", customerSalesVolume: "100.000", expectedTankOutflow: "100.000", revenue: "10000.00" } },
    completedAt: "2026-05-01T14:00:00.000Z",
    ...overrides
  };
}

describe("buildFinanceAnalytics", () => {
  it("builds monthly product, employee, expense and salary profitability from closed records", () => {
    const result = buildFinanceAnalytics({ month: "2026-05", shifts: [shift], expenses: [expense("maintenance", "200"), expense("salary", "300")], staff });

    expect(result.summary).toEqual({
      revenue: "14500.00", grossMargin: "1500.00", nonSalaryExpenses: "200.00", salaryBudget: "27000.00",
      settledPayrollNet: "0.00", settledPayrollPaid: "0.00", recordedSalaryPayments: "300.00", estimatedNetProfit: "-25700.00"
    });
    expect(result.products).toEqual([
      { productId: "diesel", productName: "Diesel", litres: "50.000", revenue: "4500.00", cost: "4000.00", grossProfit: "500.00" },
      { productId: "petrol", productName: "Petrol", litres: "100.000", revenue: "10000.00", cost: "9000.00", grossProfit: "1000.00" }
    ]);
    expect(result.staff).toEqual([
      expect.objectContaining({ staffId: "edwin", staffName: "Edwin", litres: "100.000", revenue: "10000.00", grossProfit: "1000.00", productLitres: { petrol: "100.000" } }),
      expect.objectContaining({ staffId: "priya", staffName: "Priya", litres: "50.000", revenue: "4500.00", grossProfit: "500.00", productLitres: { diesel: "50.000" } })
    ]);
    expect(result.days).toEqual([expect.objectContaining({ businessDate: "2026-05-01", revenue: "14500.00", grossMargin: "1500.00", expenses: "200.00", salaryPayments: "300.00", operatingProfitBeforeSalary: "1300.00" })]);
    expect(result.expenseCategories).toEqual([
      { category: "maintenance", amount: "200.00" }, { category: "salary", amount: "300.00" }
    ]);
  });

  it("excludes records outside the requested month", () => {
    expect(buildFinanceAnalytics({ month: "2026-06", shifts: [shift], expenses: [expense("maintenance", "200")], staff }).summary.revenue).toBe("0.00");
  });

  it("supports an exact weekly range and exposes price and staff daily history", () => {
    const outside = { ...shift, id: "outside", businessDate: "2026-05-20" };
    const result = buildFinanceAnalytics({ month: "2026-05", from: "2026-05-01", to: "2026-05-07", shifts: [shift, outside], expenses: [], staff });
    expect(result.summary.revenue).toBe("14500.00");
    expect(result.staffDays).toEqual(expect.arrayContaining([expect.objectContaining({ businessDate: "2026-05-01", staffId: "edwin", litres: "100.000" })]));
    expect(result.prices).toEqual(expect.arrayContaining([expect.objectContaining({ businessDate: "2026-05-01", productName: "Petrol", resellerPrice: "90", customerPrice: "100", marginPerLitre: "10.00" })]));
  });

  it("includes an open shift's completed pump-shifts even though it has no reconciliation yet", () => {
    const openShift: ShiftRecord = { ...shift, id: "open-today", state: "OPEN", reconciliation: undefined, businessDate: "2026-05-02", pumpShiftHistory: [pumpShiftEntry({ id: "seg-open", businessDate: "2026-05-02" })] };
    const result = buildFinanceAnalytics({ month: "2026-05", shifts: [shift, openShift], expenses: [], staff });
    expect(result.pumpShifts).toEqual([expect.objectContaining({ id: "seg-open", pumpId: "pump-a", staffName: "Edwin", litresSold: "100.000", shiftId: "open-today", shiftState: "OPEN" })]);
  });

  it("includes a completed pump-shift entry whose own business date differs from its still-open parent shift's stale opening date", () => {
    const staleOpenShift: ShiftRecord = {
      ...shift, id: "stale-open", state: "OPEN", reconciliation: undefined, businessDate: "2026-04-01",
      pumpShiftHistory: [pumpShiftEntry({ id: "seg-real-date", businessDate: "2026-05-01" })]
    };
    const result = buildFinanceAnalytics({ month: "2026-05", shifts: [staleOpenShift], expenses: [], staff });
    expect(result.pumpShifts).toEqual([expect.objectContaining({ id: "seg-real-date", shiftId: "stale-open", shiftState: "OPEN" })]);
  });

  it("excludes pump-shift history entries outside the requested period and sorts newest first", () => {
    const withinRange = pumpShiftEntry({ id: "seg-within", businessDate: "2026-05-01", completedAt: "2026-05-01T08:00:00.000Z" });
    const laterSameDay = pumpShiftEntry({ id: "seg-later", businessDate: "2026-05-01", completedAt: "2026-05-01T16:00:00.000Z" });
    const outsideRange = pumpShiftEntry({ id: "seg-outside", businessDate: "2026-06-01" });
    const shiftWithHistory: ShiftRecord = { ...shift, pumpShiftHistory: [withinRange, laterSameDay, outsideRange] };
    const result = buildFinanceAnalytics({ month: "2026-05", shifts: [shiftWithHistory], expenses: [], staff });
    expect(result.pumpShifts.map((entry) => entry.id)).toEqual(["seg-later", "seg-within"]);
  });

  it("uses approved payroll settlement instead of the budget in net profit", () => {
    const payroll = [{ id: "edwin:2026-05", staffId: "edwin", staffName: "Edwin", month: "2026-05", baseSalary: "15000", presentDays: 1, lateDays: 0, absentDays: 0, leaveDays: 0, halfDays: 0, dailyBetaRate: "0", betaDays: 1, betaEarned: "0", overtime: "0", attendanceDeduction: "1000", advances: "0", otherDeductions: "0", grossPay: "15000", totalDeductions: "1000", netPay: "14000", amountPaid: "10000", balanceDue: "4000", note: "", createdAt: "2026-05-01", updatedAt: "2026-05-01" }];
    const result = buildFinanceAnalytics({ month: "2026-05", shifts: [shift], expenses: [], staff, payroll });
    expect(result.summary).toEqual(expect.objectContaining({ settledPayrollNet: "14000.00", settledPayrollPaid: "10000.00", estimatedNetProfit: "-12500.00" }));
  });
});
