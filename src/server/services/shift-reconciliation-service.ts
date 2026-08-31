import Decimal from "decimal.js";

import {
  calculateManagementProfit,
  calculateNozzleSales,
  calculatePaymentReconciliation,
  calculateTankReconciliation
} from "@/server/calculations/reconciliation";
import type {
  CloseShiftInput,
  ShiftRecord,
  ShiftReconciliation
} from "@/server/domain/operations";

type NozzleConfig = {
  tankId: string;
  pricePerLitre: string;
  costPerLitre: string;
};

export const demoNozzleConfig: Record<string, NozzleConfig> = {
  petrol_1: { tankId: "petrol_tank", pricePerLitre: "102.50", costPerLitre: "96.80" },
  diesel_1: { tankId: "diesel_tank", pricePerLitre: "100.50", costPerLitre: "94.40" }
};

export function reconcileShift(
  shift: ShiftRecord,
  input: CloseShiftInput,
  nozzleConfig: Record<string, NozzleConfig> = demoNozzleConfig
): ShiftReconciliation {
  const nozzleResults: ShiftReconciliation["nozzles"] = {};
  const tankOutflows: Record<string, Decimal> = {};
  let fuelRevenue = new Decimal(0);
  let fuelCost = new Decimal(0);

  for (const entry of input.nonSaleDispenses) {
    if (!nozzleConfig[entry.nozzleId]) throw new Error(`Unknown nozzle: ${entry.nozzleId}`);
  }

  for (const [nozzleId, opening] of Object.entries(shift.openingNozzleReadings)) {
    const config = nozzleConfig[nozzleId];
    if (!config) throw new Error(`Unknown nozzle: ${nozzleId}`);
    const closing = input.closingNozzleReadings[nozzleId];
    if (closing === undefined) throw new Error(`Missing closing reading for ${nozzleId}`);
    const nonSale = input.nonSaleDispenses.filter((entry) => entry.nozzleId === nozzleId);
    const metered = new Decimal(closing).minus(opening);
    const nonSaleVolume = Decimal.sum(0, ...nonSale.map((entry) => entry.volume));
    const customerVolume = metered.minus(nonSaleVolume);
    const result = calculateNozzleSales({
      opening,
      closing,
      nonSaleDispenses: nonSale,
      priceSegments: [{ volume: customerVolume.toString(), pricePerLitre: config.pricePerLitre }]
    });
    nozzleResults[nozzleId] = result;
    tankOutflows[config.tankId] = (tankOutflows[config.tankId] ?? new Decimal(0)).plus(
      result.expectedTankOutflow
    );
    fuelRevenue = fuelRevenue.plus(result.revenue);
    fuelCost = fuelCost.plus(new Decimal(result.customerSalesVolume).times(config.costPerLitre));
  }

  const tankResults: ShiftReconciliation["tanks"] = {};
  for (const [tankId, openingStock] of Object.entries(shift.openingTankStocks)) {
    const actualClosingStock = input.closingTankStocks[tankId];
    if (actualClosingStock === undefined) throw new Error(`Missing closing stock for ${tankId}`);
    tankResults[tankId] = calculateTankReconciliation({
      openingStock,
      receipts: input.receipts[tankId] ?? "0",
      expectedOutflow: (tankOutflows[tankId] ?? new Decimal(0)).toString(),
      adjustments: "0",
      actualClosingStock
    });
  }

  const sales = calculatePaymentReconciliation({
    fuelRevenue: fuelRevenue.toString(),
    lubricantRevenue: input.lubricantRevenue,
    ...input.payments
  });
  const profit = calculateManagementProfit({
    revenue: sales.expectedSales,
    fuelCost: fuelCost.toString(),
    lubricantCost: input.lubricantCost,
    expenses: input.expenses
  });

  return {
    nozzles: nozzleResults,
    tanks: tankResults,
    sales,
    ...profit
  };
}
