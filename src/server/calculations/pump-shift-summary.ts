import Decimal from "decimal.js";

import { calculateNozzleSales, type NonSaleDispense } from "@/server/calculations/reconciliation";

export type PumpShiftStation = {
  stationId: string;
  productId: string;
  productName: string;
  pricePerLitre: string;
  costPerLitre: string;
};

export type PumpShiftCollections = {
  cash: string;
  upi: string;
  card: string;
  credit: string;
  other: string;
  declaredCashHandover: string;
};

const zeroCollections: PumpShiftCollections = { cash: "0", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "0" };

function money(decimal: Decimal): string {
  return decimal.toDecimalPlaces(2).toFixed(2);
}

export function calculatePumpShiftSummary(input: {
  stations: PumpShiftStation[];
  openingReadings: Record<string, string>;
  closingReadings: Record<string, string>;
  nonSaleDispenses: Array<NonSaleDispense & { nozzleId: string }>;
  collections?: PumpShiftCollections;
  staffId: string;
  staffName: string;
}) {
  const nozzles: Record<string, ReturnType<typeof calculateNozzleSales>> = {};
  let litresSold = new Decimal(0);
  let expectedSalesValue = new Decimal(0);
  const productTotals = new Map<string, { productId: string; productName: string; litres: Decimal; revenue: Decimal; cost: Decimal }>();

  for (const station of input.stations) {
    const opening = input.openingReadings[station.stationId];
    const closing = input.closingReadings[station.stationId];
    if (closing === undefined) throw new Error(`Missing closing reading for ${station.stationId}`);
    const nonSale = input.nonSaleDispenses.filter((entry) => entry.nozzleId === station.stationId);
    const metered = new Decimal(closing).minus(opening ?? "0");
    const nonSaleVolume = Decimal.sum(0, ...nonSale.map((entry) => entry.volume));
    const customerVolume = metered.minus(nonSaleVolume);
    const result = calculateNozzleSales({
      opening: opening ?? "0",
      closing,
      nonSaleDispenses: nonSale,
      priceSegments: [{ volume: customerVolume.toString(), pricePerLitre: station.pricePerLitre }]
    });
    nozzles[station.stationId] = result;
    litresSold = litresSold.plus(result.customerSalesVolume);
    expectedSalesValue = expectedSalesValue.plus(result.revenue);
    const current = productTotals.get(station.productId) ?? { productId: station.productId, productName: station.productName, litres: new Decimal(0), revenue: new Decimal(0), cost: new Decimal(0) };
    current.litres = current.litres.plus(result.customerSalesVolume);
    current.revenue = current.revenue.plus(result.revenue);
    current.cost = current.cost.plus(new Decimal(result.customerSalesVolume).times(station.costPerLitre));
    productTotals.set(station.productId, current);
  }

  const collections = input.collections ?? zeroCollections;
  const accountedTender = Decimal.sum(collections.cash, collections.upi, collections.card, collections.credit, collections.other);

  return {
    litresSold: litresSold.toDecimalPlaces(3).toFixed(3),
    expectedSalesValue: money(expectedSalesValue),
    cash: money(new Decimal(collections.cash)),
    upi: money(new Decimal(collections.upi)),
    card: money(new Decimal(collections.card)),
    credit: money(new Decimal(collections.credit)),
    other: money(new Decimal(collections.other)),
    accountedTender: money(accountedTender),
    tenderVariance: money(accountedTender.minus(expectedSalesValue)),
    declaredCashHandover: money(new Decimal(collections.declaredCashHandover)),
    cashVariance: money(new Decimal(collections.declaredCashHandover).minus(collections.cash)),
    products: [...productTotals.values()].map((product) => ({
      productId: product.productId,
      productName: product.productName,
      litresSold: product.litres.toDecimalPlaces(3).toFixed(3),
      revenue: money(product.revenue),
      grossProfit: money(product.revenue.minus(product.cost))
    })),
    nozzles
  };
}
