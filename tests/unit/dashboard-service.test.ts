import { describe, expect, it } from "vitest";

import type { ShiftRecord } from "@/server/domain/operations";
import { buildDashboardViewModel } from "@/server/services/dashboard-service";

const closedShift: ShiftRecord = {
  id: "closed-1",
  state: "CLOSED",
  name: "Morning shift",
  businessDate: "2026-08-31",
  staffOnDuty: ["Arun"],
  openingNozzleReadings: { petrol_1: "1000", diesel_1: "2000" },
  openingTankStocks: { petrol_tank: "5000", diesel_tank: "6000" },
  closingNozzleReadings: { petrol_1: "1100", diesel_1: "2100" },
  closingTankStocks: { petrol_tank: "4900", diesel_tank: "5900" },
  createdAt: "2026-08-31T03:30:00.000Z",
  startedAt: "2026-08-31T03:30:00.000Z",
  closedAt: "2026-08-31T11:00:00.000Z",
  version: 2,
  reconciliation: {
    nozzles: {
      petrol_1: { meteredVolume: "100.000", customerSalesVolume: "100.000", expectedTankOutflow: "100.000", revenue: "10250.00" },
      diesel_1: { meteredVolume: "100.000", customerSalesVolume: "100.000", expectedTankOutflow: "100.000", revenue: "10050.00" }
    },
    tanks: {
      petrol_tank: { expectedClosingStock: "4900.000", actualClosingStock: "4900.000", variance: "0.000", variancePercent: "0.000" },
      diesel_tank: { expectedClosingStock: "5900.000", actualClosingStock: "5900.000", variance: "0.000", variancePercent: "0.000" }
    },
    sales: { expectedSales: "20300.00", accountedTender: "20300.00", tenderVariance: "0.00", expectedCashHandover: "10000.00", cashVariance: "0.00" },
    grossMargin: "1180.00",
    estimatedOperatingProfit: "930.00"
  },
  closingInput: {
    closingNozzleReadings: { petrol_1: "1100", diesel_1: "2100" },
    closingTankStocks: { petrol_tank: "4900", diesel_tank: "5900" },
    nonSaleDispenses: [],
    receipts: { petrol_tank: "0", diesel_tank: "0" },
    payments: { cashSales: "10000", upi: "10300", card: "0", credit: "0", other: "0", cashReceipts: "0", cashExpenses: "0", cashRemovals: "0", declaredCashHandover: "10000" },
    lubricantRevenue: "0",
    lubricantCost: "0",
    expenses: "250"
  }
};

describe("buildDashboardViewModel", () => {
  it("derives owner metrics from closed shifts and recorded expenses", () => {
    const dashboard = buildDashboardViewModel({
      shifts: [closedShift],
      expenses: [{ id: "expense-1", category: "maintenance", amount: "250", paymentMethod: "cash", date: "2026-08-31", note: "Repair", createdAt: "2026-08-31T09:00:00.000Z", idempotencyKey: "expense-1", shiftId: "closed-1" }],
      now: new Date("2026-08-31T12:00:00.000Z")
    });

    expect(dashboard.metrics.map((metric) => metric.value)).toEqual([
      "₹20,300",
      "₹1,180",
      "₹250",
      "₹930"
    ]);
    expect(dashboard.fuelSold.map((item) => item.litres)).toEqual(["100 L", "100 L"]);
    expect(dashboard.currentShift).toBeNull();
    expect(dashboard.dataStatus).toBe("CLOSED");
  });

  it("uses the active shift as the latest recorded tank position", () => {
    const active: ShiftRecord = {
      ...closedShift,
      id: "open-1",
      state: "OPEN",
      name: "Evening shift",
      openingTankStocks: { petrol_tank: "12000", diesel_tank: "8000" },
      reconciliation: undefined,
      closingNozzleReadings: undefined,
      closingTankStocks: undefined,
      closingInput: undefined,
      closedAt: undefined,
      startedAt: "2026-08-31T11:30:00.000Z",
      version: 1
    };

    const dashboard = buildDashboardViewModel({
      shifts: [active, closedShift],
      expenses: [],
      now: new Date("2026-08-31T12:00:00.000Z")
    });

    expect(dashboard.currentShift?.id).toBe("open-1");
    expect(dashboard.tanks.map((tank) => tank.litres)).toEqual(["12,000 L", "8,000 L"]);
    expect(dashboard.dataStatus).toBe("LIVE");
  });
});
