import Decimal from "decimal.js";

Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP });

export class CalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalculationError";
  }
}

type DecimalInput = string | number;

function value(input: DecimalInput, label: string): Decimal {
  try {
    const decimal = new Decimal(input);
    if (!decimal.isFinite()) {
      throw new Error("not finite");
    }
    return decimal;
  } catch {
    throw new CalculationError(`${label} must be a valid decimal value`);
  }
}

function nonNegative(input: DecimalInput, label: string): Decimal {
  const decimal = value(input, label);
  if (decimal.isNegative()) {
    throw new CalculationError(`${label} cannot be negative`);
  }
  return decimal;
}

function volume(decimal: Decimal): string {
  return decimal.toDecimalPlaces(3).toFixed(3);
}

function money(decimal: Decimal): string {
  return decimal.toDecimalPlaces(2).toFixed(2);
}

export type NonSaleDispense = {
  volume: DecimalInput;
  returnedToTank: boolean;
};

export type PriceSegment = {
  volume: DecimalInput;
  pricePerLitre: DecimalInput;
};

export function calculateNozzleSales(input: {
  opening: DecimalInput;
  closing: DecimalInput;
  nonSaleDispenses: NonSaleDispense[];
  priceSegments: PriceSegment[];
}) {
  const opening = nonNegative(input.opening, "Opening totalizer");
  const closing = nonNegative(input.closing, "Closing totalizer");
  const metered = closing.minus(opening);

  if (metered.isNegative()) {
    throw new CalculationError("Closing totalizer cannot be below opening totalizer");
  }

  const nonSales = input.nonSaleDispenses.map((entry, index) => ({
    volume: nonNegative(entry.volume, `Non-sale dispense ${index + 1}`),
    returnedToTank: entry.returnedToTank
  }));
  const nonSaleTotal = Decimal.sum(0, ...nonSales.map((entry) => entry.volume));

  if (nonSaleTotal.greaterThan(metered)) {
    throw new CalculationError("Non-sale dispenses cannot exceed metered volume");
  }

  const customerSales = metered.minus(nonSaleTotal);
  const returned = Decimal.sum(
    0,
    ...nonSales.filter((entry) => entry.returnedToTank).map((entry) => entry.volume)
  );
  const expectedTankOutflow = metered.minus(returned);
  const priceSegments = input.priceSegments.map((segment, index) => ({
    volume: nonNegative(segment.volume, `Price segment ${index + 1} volume`),
    price: nonNegative(segment.pricePerLitre, `Price segment ${index + 1} price`)
  }));
  const pricedVolume = Decimal.sum(0, ...priceSegments.map((segment) => segment.volume));

  if (!pricedVolume.equals(customerSales)) {
    throw new CalculationError("Price segments must equal customer sales volume");
  }

  const revenue = Decimal.sum(
    0,
    ...priceSegments.map((segment) => segment.volume.times(segment.price))
  );

  return {
    meteredVolume: volume(metered),
    customerSalesVolume: volume(customerSales),
    expectedTankOutflow: volume(expectedTankOutflow),
    revenue: money(revenue)
  };
}

export function calculateTankReconciliation(input: {
  openingStock: DecimalInput;
  receipts: DecimalInput;
  expectedOutflow: DecimalInput;
  adjustments: DecimalInput;
  actualClosingStock: DecimalInput;
}) {
  const opening = nonNegative(input.openingStock, "Opening stock");
  const receipts = nonNegative(input.receipts, "Receipts");
  const outflow = nonNegative(input.expectedOutflow, "Expected outflow");
  const adjustments = value(input.adjustments, "Adjustments");
  const actual = nonNegative(input.actualClosingStock, "Actual closing stock");
  const expected = opening.plus(receipts).minus(outflow).plus(adjustments);

  if (expected.isNegative()) {
    throw new CalculationError("Expected closing stock cannot be negative");
  }

  const variance = actual.minus(expected);
  const basis = outflow.isZero() ? expected : outflow;
  const variancePercent = basis.isZero() ? new Decimal(0) : variance.dividedBy(basis).times(100);

  return {
    expectedClosingStock: volume(expected),
    actualClosingStock: volume(actual),
    variance: volume(variance),
    variancePercent: volume(variancePercent)
  };
}

export function calculatePaymentReconciliation(input: {
  fuelRevenue: DecimalInput;
  lubricantRevenue: DecimalInput;
  cashSales: DecimalInput;
  upi: DecimalInput;
  card: DecimalInput;
  credit: DecimalInput;
  other: DecimalInput;
  cashReceipts: DecimalInput;
  cashExpenses: DecimalInput;
  cashRemovals: DecimalInput;
  declaredCashHandover: DecimalInput;
}) {
  const expectedSales = nonNegative(input.fuelRevenue, "Fuel revenue").plus(
    nonNegative(input.lubricantRevenue, "Lubricant revenue")
  );
  const cashSales = nonNegative(input.cashSales, "Cash sales");
  const accountedTender = Decimal.sum(
    cashSales,
    nonNegative(input.upi, "UPI"),
    nonNegative(input.card, "Card"),
    nonNegative(input.credit, "Credit"),
    nonNegative(input.other, "Other tender")
  );
  const expectedCash = cashSales
    .plus(nonNegative(input.cashReceipts, "Cash receipts"))
    .minus(nonNegative(input.cashExpenses, "Cash expenses"))
    .minus(nonNegative(input.cashRemovals, "Cash removals"));
  const declaredCash = nonNegative(input.declaredCashHandover, "Declared cash handover");

  return {
    expectedSales: money(expectedSales),
    accountedTender: money(accountedTender),
    tenderVariance: money(accountedTender.minus(expectedSales)),
    expectedCashHandover: money(expectedCash),
    cashVariance: money(declaredCash.minus(expectedCash))
  };
}

export function calculateManagementProfit(input: {
  revenue: DecimalInput;
  fuelCost: DecimalInput;
  lubricantCost: DecimalInput;
  expenses: DecimalInput;
}) {
  const revenue = nonNegative(input.revenue, "Revenue");
  const cost = nonNegative(input.fuelCost, "Fuel cost").plus(
    nonNegative(input.lubricantCost, "Lubricant cost")
  );
  const grossMargin = revenue.minus(cost);
  const operatingProfit = grossMargin.minus(nonNegative(input.expenses, "Expenses"));

  return {
    grossMargin: money(grossMargin),
    estimatedOperatingProfit: money(operatingProfit)
  };
}
