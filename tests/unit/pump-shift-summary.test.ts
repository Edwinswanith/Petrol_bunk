import { describe, expect, it } from "vitest";

import { CalculationError } from "@/server/calculations/reconciliation";
import { calculatePumpShiftSummary } from "@/server/calculations/pump-shift-summary";

const stations = [
  { stationId: "a_n1", productId: "petrol", productName: "Petrol", pricePerLitre: "102.50", costPerLitre: "96.80" },
  { stationId: "a_n2", productId: "petrol", productName: "Petrol", pricePerLitre: "102.50", costPerLitre: "96.80" },
  { stationId: "a_n3", productId: "diesel", productName: "Diesel", pricePerLitre: "100.50", costPerLitre: "94.40" }
];

describe("calculatePumpShiftSummary", () => {
  it("sums litres and revenue across a pump's stations, grouped by product", () => {
    const summary = calculatePumpShiftSummary({
      stations,
      openingReadings: { a_n1: "1000", a_n2: "2000", a_n3: "3000" },
      closingReadings: { a_n1: "1100", a_n2: "2050", a_n3: "3030" },
      nonSaleDispenses: [],
      staffId: "staff-arun", staffName: "Arun"
    });

    expect(summary.litresSold).toBe("180.000");
    expect(summary.expectedSalesValue).toBe("18390.00");
    expect(summary.products).toEqual([
      { productId: "petrol", productName: "Petrol", litresSold: "150.000", revenue: "15375.00", grossProfit: "855.00" },
      { productId: "diesel", productName: "Diesel", litresSold: "30.000", revenue: "3015.00", grossProfit: "183.00" }
    ]);
    expect(summary.nozzles.a_n1).toEqual({ meteredVolume: "100.000", customerSalesVolume: "100.000", expectedTankOutflow: "100.000", revenue: "10250.00" });
  });

  it("nets a returned test dispense out of the metered volume for that nozzle only", () => {
    const summary = calculatePumpShiftSummary({
      stations,
      openingReadings: { a_n1: "1000", a_n2: "2000", a_n3: "3000" },
      closingReadings: { a_n1: "1100", a_n2: "2000", a_n3: "3000" },
      nonSaleDispenses: [{ nozzleId: "a_n1", volume: "10", returnedToTank: true }],
      staffId: "staff-arun", staffName: "Arun"
    });

    expect(summary.litresSold).toBe("90.000");
    expect(summary.nozzles.a_n1.customerSalesVolume).toBe("90.000");
    expect(summary.nozzles.a_n1.expectedTankOutflow).toBe("90.000");
  });

  it("computes accounted tender, tender variance and cash variance from the collections entered", () => {
    const summary = calculatePumpShiftSummary({
      stations,
      openingReadings: { a_n1: "1000", a_n2: "2000", a_n3: "3000" },
      closingReadings: { a_n1: "1000", a_n2: "2000", a_n3: "3000" },
      nonSaleDispenses: [],
      collections: { cash: "500", upi: "200", card: "0", credit: "0", other: "0", declaredCashHandover: "480" },
      staffId: "staff-arun", staffName: "Arun"
    });

    expect(summary.accountedTender).toBe("700.00");
    expect(summary.expectedSalesValue).toBe("0.00");
    expect(summary.tenderVariance).toBe("700.00");
    expect(summary.cashVariance).toBe("-20.00");
    expect(summary.cash).toBe("500.00");
    expect(summary.declaredCashHandover).toBe("480.00");
  });

  it("defaults collections to zero when none are entered yet", () => {
    const summary = calculatePumpShiftSummary({
      stations,
      openingReadings: { a_n1: "1000", a_n2: "2000", a_n3: "3000" },
      closingReadings: { a_n1: "1000", a_n2: "2000", a_n3: "3000" },
      nonSaleDispenses: [],
      staffId: "staff-arun", staffName: "Arun"
    });

    expect(summary.accountedTender).toBe("0.00");
    expect(summary.tenderVariance).toBe("0.00");
    expect(summary.cashVariance).toBe("0.00");
  });

  it("propagates the closing-below-opening error from the underlying nozzle calculation", () => {
    expect(() => calculatePumpShiftSummary({
      stations,
      openingReadings: { a_n1: "1000", a_n2: "2000", a_n3: "3000" },
      closingReadings: { a_n1: "900", a_n2: "2000", a_n3: "3000" },
      nonSaleDispenses: [],
      staffId: "staff-arun", staffName: "Arun"
    })).toThrow(CalculationError);
  });
});
