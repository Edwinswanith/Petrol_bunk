import Decimal from "decimal.js";

import type { DashboardViewModel, TankSummary } from "@/contracts/dashboard";
import {
  businessDate,
  businessDateLabel,
  businessTimeLabel,
  greetingForBusinessTime
} from "@/lib/business-time";
import type { ShiftRecord } from "@/server/domain/operations";
import type { ExpenseRecord } from "@/server/repositories/journal-store";
import type { ForecourtConfiguration, FuelProduct, FuelTank } from "@/server/domain/forecourt";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});
const quantity = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

function sum(values: Array<string | undefined>): Decimal {
  return Decimal.sum(0, ...values.map((entry) => entry ?? "0"));
}

function tankSummary(
  tank: Pick<FuelTank, "id" | "name" | "capacityLitres">,
  product: Pick<FuelProduct, "name">,
  stock: string,
  dailyOutflow: Decimal
): TankSummary {
  const capacity = new Decimal(tank.capacityLitres);
  const available = new Decimal(stock || "0");
  const percentage = Math.max(0, Math.min(100, available.div(capacity).times(100).round().toNumber()));
  const status = percentage <= 20 ? "critical" : percentage <= 45 ? "watch" : "healthy";
  const days = dailyOutflow.isZero() ? "No sales rate" : `${available.div(dailyOutflow).toDecimalPlaces(1)} days`;
  return {
    id: tank.id,
    name: tank.name,
    product: product.name,
    litres: `${quantity.format(available.toNumber())} L`,
    capacityLitres: `${quantity.format(capacity.toNumber())} L`,
    percentage,
    daysRemaining: days,
    status
  };
}

export function buildDashboardViewModel(input: {
  shifts: ShiftRecord[];
  expenses: ExpenseRecord[];
  configuration?: ForecourtConfiguration;
  now?: Date;
}): DashboardViewModel {
  const now = input.now ?? new Date();
  const date = businessDate(now);
  const todayShifts = input.shifts.filter((shift) => shift.businessDate === date);
  const closed = todayShifts.filter((shift) => shift.reconciliation);
  const active = input.shifts.find((shift) => shift.state === "OPEN") ?? null;
  const latestClosed = closed[0] ?? null;
  const todayExpenses = input.expenses.filter((expense) => expense.date === date);

  const sales = sum(closed.map((shift) => shift.reconciliation?.sales.expectedSales));
  const grossMargin = sum(closed.map((shift) => shift.reconciliation?.grossMargin));
  const expenses = sum(todayExpenses.map((expense) => expense.amount));
  const operatingProfit = grossMargin.minus(expenses);

  const productSales = new Map<string, { name: string; litres: Decimal }>();
  if (input.configuration) {
    for (const product of input.configuration.products.filter((item) => item.active)) {
      const litres = sum(closed.flatMap((shift) => shift.reconciliation?.products?.filter((item) => item.productId === product.id).map((item) => item.litresSold) ?? []));
      productSales.set(product.id, { name: product.name, litres });
    }
  } else {
    productSales.set("petrol", { name: "Petrol", litres: sum(closed.map((shift) => shift.reconciliation?.nozzles.petrol_1?.customerSalesVolume)) });
    productSales.set("diesel", { name: "Diesel", litres: sum(closed.map((shift) => shift.reconciliation?.nozzles.diesel_1?.customerSalesVolume)) });
  }
  const totalSold = Decimal.sum(0, ...[...productSales.values()].map((entry) => entry.litres));
  const percentOfTotal = (value: Decimal) => totalSold.isZero() ? 0 : value.div(totalSold).times(100).round().toNumber();

  const recordedStock = input.configuration ? Object.fromEntries(input.configuration.tanks.map((tank) => [tank.id, tank.currentStock])) : active?.openingTankStocks ?? latestClosed?.closingTankStocks ?? {
    petrol_tank: "0",
    diesel_tank: "0"
  };
  const configuredTanks = input.configuration?.tanks.filter((tank) => tank.active) ?? [
    { id: "petrol_tank", name: "Tank P1", productId: "petrol", capacityLitres: "20000" },
    { id: "diesel_tank", name: "Tank D1", productId: "diesel", capacityLitres: "20000" }
  ];
  const productLookup = new Map((input.configuration?.products ?? [
    { id: "petrol", name: "Petrol" }, { id: "diesel", name: "Diesel" }
  ]).map((product) => [product.id, product]));
  const tanks = configuredTanks.map((tank) => tankSummary(tank, productLookup.get(tank.productId) ?? { name: "Fuel" }, recordedStock[tank.id] ?? "0", productSales.get(tank.productId)?.litres ?? new Decimal(0)));

  const paymentAmounts = {
    Cash: sum(closed.map((shift) => shift.closingInput?.payments.cashSales)),
    UPI: sum(closed.map((shift) => shift.closingInput?.payments.upi)),
    Card: sum(closed.map((shift) => shift.closingInput?.payments.card)),
    Credit: sum(closed.map((shift) => shift.closingInput?.payments.credit))
  };
  const paymentTotal = Decimal.sum(0, ...Object.values(paymentAmounts));

  const alerts: DashboardViewModel["alerts"] = tanks
    .filter((tank) => tank.status !== "healthy")
    .map((tank) => ({
      id: `${tank.id}-stock`,
      title: `${tank.product} stock needs attention`,
      detail: `${tank.litres} is the latest recorded stock (${tank.percentage}% of capacity).`,
      severity: tank.status === "critical" ? "critical" : "warning",
      href: `/stock/${tank.id}`
    }));
  if (!alerts.length) {
    alerts.push({
      id: "stock-healthy",
      title: "Recorded tank stock is healthy",
      detail: "Both tanks are above the configured watch level.",
      severity: "info",
      href: "/stock"
    });
  }

  return {
    greeting: greetingForBusinessTime(now),
    businessDateLabel: businessDateLabel(now),
    lastUpdatedLabel: "Updated just now",
    dataStatus: active ? "LIVE" : "CLOSED",
    metrics: [
      { label: "Sales today", value: inr.format(sales.toNumber()), detail: `${closed.length} closed shift${closed.length === 1 ? "" : "s"}`, tone: "positive" },
      { label: "Gross margin", value: inr.format(grossMargin.toNumber()), detail: sales.isZero() ? "Awaiting a closed shift" : `${grossMargin.div(sales).times(100).toDecimalPlaces(1)}% of sales`, tone: "positive" },
      { label: "Expenses", value: inr.format(expenses.toNumber()), detail: `${todayExpenses.length} entr${todayExpenses.length === 1 ? "y" : "ies"} today`, tone: "default" },
      { label: "Est. operating profit", value: inr.format(operatingProfit.toNumber()), detail: "Closed margin less recorded expenses", tone: operatingProfit.isNegative() ? "warning" : "positive" }
    ],
    currentShift: active ? {
      id: active.id,
      name: active.name,
      status: "OPEN",
      startedAtLabel: `Started at ${businessTimeLabel(active.startedAt)}`,
      staffOnDuty: active.staffOnDuty,
      completion: 50
    } : null,
    tanks,
    fuelSold: [...productSales.values()].map((product) => ({ product: product.name, litres: `${quantity.format(product.litres.toNumber())} L`, percentage: percentOfTotal(product.litres) })),
    paymentMix: Object.entries(paymentAmounts).map(([method, amount]) => ({
      method,
      amount: inr.format(amount.toNumber()),
      percentage: paymentTotal.isZero() ? 0 : amount.div(paymentTotal).times(100).round().toNumber()
    })),
    alerts
  };
}
