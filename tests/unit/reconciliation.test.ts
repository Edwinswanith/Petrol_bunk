import { describe, expect, it } from "vitest";

import {
  CalculationError,
  calculateManagementProfit,
  calculateNozzleSales,
  calculatePaymentReconciliation,
  calculateTankReconciliation
} from "@/server/calculations/reconciliation";
import type { CloseShiftInput, ShiftRecord } from "@/server/domain/operations";
import { reconcileShift } from "@/server/services/shift-reconciliation-service";

describe("calculateNozzleSales", () => {
  it("calculates metered volume and revenue across price segments", () => {
    const result = calculateNozzleSales({
      opening: "182350.250",
      closing: "185950.750",
      nonSaleDispenses: [],
      priceSegments: [
        { volume: "1600.500", pricePerLitre: "102.50" },
        { volume: "2000.000", pricePerLitre: "103.00" }
      ]
    });

    expect(result).toEqual({
      meteredVolume: "3600.500",
      customerSalesVolume: "3600.500",
      expectedTankOutflow: "3600.500",
      revenue: "370051.25"
    });
  });

  it("subtracts a returned test from customer sales and tank outflow", () => {
    const result = calculateNozzleSales({
      opening: "1000",
      closing: "1100",
      nonSaleDispenses: [{ volume: "5", returnedToTank: true }],
      priceSegments: [{ volume: "95", pricePerLitre: "100" }]
    });

    expect(result.customerSalesVolume).toBe("95.000");
    expect(result.expectedTankOutflow).toBe("95.000");
    expect(result.revenue).toBe("9500.00");
  });

  it("keeps a non-returned test in physical tank outflow", () => {
    const result = calculateNozzleSales({
      opening: "1000",
      closing: "1100",
      nonSaleDispenses: [{ volume: "5", returnedToTank: false }],
      priceSegments: [{ volume: "95", pricePerLitre: "100" }]
    });

    expect(result.customerSalesVolume).toBe("95.000");
    expect(result.expectedTankOutflow).toBe("100.000");
  });

  it("rejects a closing totalizer below opening", () => {
    expect(() =>
      calculateNozzleSales({
        opening: "1100",
        closing: "1000",
        nonSaleDispenses: [],
        priceSegments: []
      })
    ).toThrowError(CalculationError);
  });

  it("rejects price segments that do not cover customer sales volume", () => {
    expect(() =>
      calculateNozzleSales({
        opening: "1000",
        closing: "1100",
        nonSaleDispenses: [],
        priceSegments: [{ volume: "90", pricePerLitre: "100" }]
      })
    ).toThrow("Price segments must equal customer sales volume");
  });

  it("rejects invalid, negative and excessive non-sale readings", () => {
    expect(() =>
      calculateNozzleSales({
        opening: "not-a-number",
        closing: "1100",
        nonSaleDispenses: [],
        priceSegments: []
      })
    ).toThrow("Opening totalizer must be a valid decimal value");

    expect(() =>
      calculateNozzleSales({
        opening: "1000",
        closing: "1100",
        nonSaleDispenses: [{ volume: "-1", returnedToTank: false }],
        priceSegments: []
      })
    ).toThrow("Non-sale dispense 1 cannot be negative");

    expect(() =>
      calculateNozzleSales({
        opening: "1000",
        closing: "1100",
        nonSaleDispenses: [{ volume: "101", returnedToTank: false }],
        priceSegments: []
      })
    ).toThrow("Non-sale dispenses cannot exceed metered volume");
  });
});

describe("calculateTankReconciliation", () => {
  it("calculates expected stock and exposes physical variance", () => {
    const result = calculateTankReconciliation({
      openingStock: "10000",
      receipts: "5000",
      expectedOutflow: "3200",
      adjustments: "0",
      actualClosingStock: "11765"
    });

    expect(result).toEqual({
      expectedClosingStock: "11800.000",
      actualClosingStock: "11765.000",
      variance: "-35.000",
      variancePercent: "-1.094"
    });
  });

  it("handles an empty tank basis and rejects impossible stock", () => {
    expect(
      calculateTankReconciliation({
        openingStock: "0",
        receipts: "0",
        expectedOutflow: "0",
        adjustments: "0",
        actualClosingStock: "0"
      }).variancePercent
    ).toBe("0.000");

    expect(() =>
      calculateTankReconciliation({
        openingStock: "10",
        receipts: "0",
        expectedOutflow: "11",
        adjustments: "0",
        actualClosingStock: "0"
      })
    ).toThrow("Expected closing stock cannot be negative");
  });
});

describe("calculatePaymentReconciliation", () => {
  it("keeps tender variance separate from physical cash variance", () => {
    const result = calculatePaymentReconciliation({
      fuelRevenue: "483250",
      lubricantRevenue: "0",
      cashSales: "180000",
      upi: "220000",
      card: "73000",
      credit: "10000",
      other: "0",
      cashReceipts: "0",
      cashExpenses: "1000",
      cashRemovals: "0",
      declaredCashHandover: "178750"
    });

    expect(result).toEqual({
      expectedSales: "483250.00",
      accountedTender: "483000.00",
      tenderVariance: "-250.00",
      expectedCashHandover: "179000.00",
      cashVariance: "-250.00"
    });
  });

  it("rejects negative tender values", () => {
    expect(() =>
      calculatePaymentReconciliation({
        fuelRevenue: "100",
        lubricantRevenue: "0",
        cashSales: "-1",
        upi: "101",
        card: "0",
        credit: "0",
        other: "0",
        cashReceipts: "0",
        cashExpenses: "0",
        cashRemovals: "0",
        declaredCashHandover: "0"
      })
    ).toThrow("Cash sales cannot be negative");
  });
});

describe("calculateManagementProfit", () => {
  it("reports gross margin and estimated operating profit", () => {
    expect(
      calculateManagementProfit({
        revenue: "542850",
        fuelCost: "507080",
        lubricantCost: "0",
        expenses: "6350"
      })
    ).toEqual({
      grossMargin: "35770.00",
      estimatedOperatingProfit: "29420.00"
    });
  });
});

describe("staff machine reconciliation", () => {
  it("attributes nozzle litres, expected collection and handover variance to the assigned staff", () => {
    const shift: ShiftRecord = {
      id: "shift-1",
      state: "OPEN",
      name: "Morning shift",
      businessDate: "2026-08-31",
      staffOnDuty: ["Arun", "Priya"],
      staffAssignments: [
        { staffId: "staff-arun", staffName: "Arun", nozzleId: "petrol_1" },
        { staffId: "staff-priya", staffName: "Priya", nozzleId: "diesel_1" }
      ],
      openingNozzleReadings: { petrol_1: "1000", diesel_1: "2000" },
      openingTankStocks: { petrol_tank: "5000", diesel_tank: "5000" },
      createdAt: "2026-08-31T03:30:00.000Z",
      startedAt: "2026-08-31T03:30:00.000Z",
      version: 1
    };
    const input: CloseShiftInput = {
      closingNozzleReadings: { petrol_1: "1100", diesel_1: "2050" },
      closingTankStocks: { petrol_tank: "4905", diesel_tank: "4950" },
      nonSaleDispenses: [{ nozzleId: "petrol_1", volume: "5", returnedToTank: true }],
      receipts: { petrol_tank: "0", diesel_tank: "0" },
      payments: {
        cashSales: "14762.50", upi: "0", card: "0", credit: "0", other: "0",
        cashReceipts: "0", cashExpenses: "0", cashRemovals: "0", declaredCashHandover: "14762.50"
      },
      staffHandovers: { "staff-arun": "9700", "staff-priya": "5025" },
      lubricantRevenue: "0",
      lubricantCost: "0",
      expenses: "0"
    };

    expect(reconcileShift(shift, input).staff).toEqual([
      {
        staffId: "staff-arun",
        staffName: "Arun",
        nozzleId: "petrol_1",
        machineLabel: "Petrol machine P1",
        product: "Petrol",
        openingReading: "1000",
        closingReading: "1100",
        litresSold: "95.000",
        expectedSalesValue: "9737.50",
        declaredHandover: "9700.00",
        handoverVariance: "-37.50"
      },
      {
        staffId: "staff-priya",
        staffName: "Priya",
        nozzleId: "diesel_1",
        machineLabel: "Diesel machine D1",
        product: "Diesel",
        openingReading: "2000",
        closingReading: "2050",
        litresSold: "50.000",
        expectedSalesValue: "5025.00",
        declaredHandover: "5025.00",
        handoverVariance: "0.00"
      }
    ]);
  });

  it("uses the shift station snapshot for configurable products and aggregates stations sharing a tank", () => {
    const shift: ShiftRecord = {
      id: "shift-xp95",
      state: "OPEN",
      name: "Morning shift",
      businessDate: "2026-09-01",
      staffOnDuty: ["Arun"],
      staffAssignments: [
        { staffId: "staff-arun", staffName: "Arun", nozzleId: "xp95_1" },
        { staffId: "staff-arun", staffName: "Arun", nozzleId: "xp95_2" }
      ],
      stationSnapshots: [
        { stationId: "xp95_1", code: "X1", name: "XP95 station 1", productId: "xp95", productName: "XP95", tankId: "xp95_tank", tankName: "XP95 Tank", pricePerLitre: "110", costPerLitre: "102" },
        { stationId: "xp95_2", code: "X2", name: "XP95 station 2", productId: "xp95", productName: "XP95", tankId: "xp95_tank", tankName: "XP95 Tank", pricePerLitre: "110", costPerLitre: "102" }
      ],
      tankSnapshots: [
        { tankId: "xp95_tank", code: "XT1", name: "XP95 Tank", productId: "xp95", productName: "XP95", capacityLitres: "10000" }
      ],
      openingNozzleReadings: { xp95_1: "1000", xp95_2: "500" },
      openingTankStocks: { xp95_tank: "5000" },
      createdAt: "2026-09-01T03:30:00.000Z",
      startedAt: "2026-09-01T03:30:00.000Z",
      version: 1
    };
    const input: CloseShiftInput = {
      closingNozzleReadings: { xp95_1: "1100", xp95_2: "550" },
      closingTankStocks: { xp95_tank: "4850" },
      nonSaleDispenses: [],
      receipts: { xp95_tank: "0" },
      payments: {
        cashSales: "16500", upi: "0", card: "0", credit: "0", other: "0",
        cashReceipts: "0", cashExpenses: "0", cashRemovals: "0", declaredCashHandover: "16500"
      },
      lubricantRevenue: "0",
      lubricantCost: "0",
      expenses: "0"
    };

    const result = reconcileShift(shift, input);

    expect(result.sales.expectedSales).toBe("16500.00");
    expect(result.tanks.xp95_tank.expectedClosingStock).toBe("4850.000");
    expect(result.products).toEqual([
      { productId: "xp95", productName: "XP95", litresSold: "150.000", revenue: "16500.00" }
    ]);
    expect(result.staff).toEqual([
      expect.objectContaining({ staffId: "staff-arun", litresSold: "150.000", expectedSalesValue: "16500.00", declaredHandover: "0.00", handoverVariance: "-16500.00" })
    ]);
  });
});
