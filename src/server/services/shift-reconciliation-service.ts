import Decimal from "decimal.js";

import {
  CalculationError,
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
import { pumpGroupId, pumpGroupLabel } from "@/server/domain/pump-grouping";
import { calculatePumpShiftSummary } from "@/server/calculations/pump-shift-summary";

export type NozzleConfig = {
  tankId: string;
  machineLabel: string;
  product: string;
  pricePerLitre: string;
  costPerLitre: string;
};

export const demoNozzleConfig: Record<string, NozzleConfig> = {
  petrol_1: { tankId: "petrol_tank", machineLabel: "Petrol machine P1", product: "Petrol", pricePerLitre: "102.50", costPerLitre: "96.80" },
  diesel_1: { tankId: "diesel_tank", machineLabel: "Diesel machine D1", product: "Diesel", pricePerLitre: "100.50", costPerLitre: "94.40" }
};

export function nozzleConfigForShift(shift: ShiftRecord): Record<string, NozzleConfig> {
  if (!shift.stationSnapshots?.length) return demoNozzleConfig;
  return Object.fromEntries(shift.stationSnapshots.map((station) => [station.stationId, {
    tankId: station.tankId,
    machineLabel: `${station.name} (${station.code})`,
    product: station.productName,
    pricePerLitre: station.pricePerLitre,
    costPerLitre: station.costPerLitre
  }]));
}

export function reconcileShift(
  shift: ShiftRecord,
  input: CloseShiftInput,
  nozzleConfig: Record<string, NozzleConfig> = nozzleConfigForShift(shift)
): ShiftReconciliation {
  const nozzleResults: ShiftReconciliation["nozzles"] = {};
  const tankOutflows: Record<string, Decimal> = {};
  let fuelRevenue = new Decimal(0);
  let fuelCost = new Decimal(0);
  const productTotals = new Map<string, { productId: string; productName: string; litres: Decimal; revenue: Decimal }>();

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
    const snapshot = shift.stationSnapshots?.find((station) => station.stationId === nozzleId);
    const productId = snapshot?.productId ?? config.product.toLowerCase();
    const current = productTotals.get(productId) ?? { productId, productName: config.product, litres: new Decimal(0), revenue: new Decimal(0) };
    current.litres = current.litres.plus(result.customerSalesVolume);
    current.revenue = current.revenue.plus(result.revenue);
    productTotals.set(productId, current);
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

  const staff = [...new Map((shift.staffAssignments ?? []).map((assignment) => [assignment.staffId, assignment])).values()].map((person) => {
    const assignments = (shift.staffAssignments ?? []).filter((assignment) => assignment.staffId === person.staffId);
    const rows = assignments.map((assignment) => {
      const nozzle = nozzleResults[assignment.nozzleId];
      const config = nozzleConfig[assignment.nozzleId];
      if (!nozzle || !config) throw new Error(`Unknown assigned nozzle: ${assignment.nozzleId}`);
      return { assignment, nozzle, config };
    });
    const declared = new Decimal(input.staffHandovers?.[person.staffId] ?? "0");
    const expected = Decimal.sum(0, ...rows.map((row) => row.nozzle.revenue));
    const litres = Decimal.sum(0, ...rows.map((row) => row.nozzle.customerSalesVolume));
    return {
      staffId: person.staffId,
      staffName: person.staffName,
      nozzleId: rows.map((row) => row.assignment.nozzleId).join(","),
      machineLabel: rows.map((row) => row.config.machineLabel).join(", "),
      product: [...new Set(rows.map((row) => row.config.product))].join(", "),
      openingReading: rows.map((row) => shift.openingNozzleReadings[row.assignment.nozzleId]).join(", "),
      closingReading: rows.map((row) => input.closingNozzleReadings[row.assignment.nozzleId]).join(", "),
      litresSold: litres.toDecimalPlaces(3).toFixed(3),
      expectedSalesValue: expected.toDecimalPlaces(2).toFixed(2),
      declaredHandover: declared.toDecimalPlaces(2).toFixed(2),
      handoverVariance: declared.minus(expected).toDecimalPlaces(2).toFixed(2)
    };
  });

  const sides: NonNullable<ShiftReconciliation["sides"]> = [];
  const groupedPumps = new Map<string, NonNullable<ShiftRecord["stationSnapshots"]>>();
  for (const station of shift.stationSnapshots ?? []) {
    if (!station.dispenserId && !station.sideId && !input.sideCollections?.[station.stationId]) continue;
    const pumpId = pumpGroupId(station, station.stationId);
    groupedPumps.set(pumpId, [...(groupedPumps.get(pumpId) ?? []), station]);
  }
  for (const [pumpId, stations] of groupedPumps) {
    const nozzleIds = stations.map((station) => station.stationId);
    const assignment = (shift.staffAssignments ?? []).find((item) => nozzleIds.includes(item.nozzleId));
    const summary = calculatePumpShiftSummary({
      stations,
      openingReadings: shift.openingNozzleReadings,
      closingReadings: input.closingNozzleReadings,
      nonSaleDispenses: input.nonSaleDispenses,
      collections: input.sideCollections?.[pumpId],
      staffId: assignment?.staffId ?? "",
      staffName: assignment?.staffName ?? "Unassigned"
    });
    sides.push({
      sideId: pumpId,
      sideLabel: pumpGroupLabel(stations[0], pumpId),
      dispenserId: stations[0].dispenserId ?? "",
      dispenserCode: stations[0].dispenserCode ?? "",
      staffId: assignment?.staffId ?? "",
      staffName: assignment?.staffName ?? "Unassigned",
      nozzleIds,
      litresSold: summary.litresSold,
      expectedSalesValue: summary.expectedSalesValue,
      cash: summary.cash,
      upi: summary.upi,
      card: summary.card,
      credit: summary.credit,
      other: summary.other,
      accountedTender: summary.accountedTender,
      tenderVariance: summary.tenderVariance,
      declaredCashHandover: summary.declaredCashHandover,
      cashVariance: summary.cashVariance,
      products: summary.products
    });
  }

  return {
    nozzles: nozzleResults,
    tanks: tankResults,
    sales,
    staff,
    sides,
    products: [...productTotals.values()].map((product) => ({
      productId: product.productId,
      productName: product.productName,
      litresSold: product.litres.toDecimalPlaces(3).toFixed(3),
      revenue: product.revenue.toDecimalPlaces(2).toFixed(2)
    })),
    ...profit
  };
}

export function requireVarianceExplanation(reconciliation: ShiftReconciliation, explanation?: string) {
  const paymentVariance = new Decimal(reconciliation.sales.tenderVariance).abs();
  const cashVariance = new Decimal(reconciliation.sales.cashVariance).abs();
  const tankVariance = Object.values(reconciliation.tanks).some((tank) => new Decimal(tank.variance).abs().greaterThan("1"));
  const sideVariance = reconciliation.sides?.some((side) =>
    new Decimal(side.tenderVariance).abs().greaterThan("1") ||
    new Decimal(side.cashVariance).abs().greaterThan("1")
  );
  if ((paymentVariance.greaterThan("1") || cashVariance.greaterThan("1") || tankVariance || sideVariance) && !explanation?.trim()) {
    throw new CalculationError("Explain the payment or tank variance before closing the shift");
  }
}
