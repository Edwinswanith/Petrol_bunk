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
  id: "petrol_tank" | "diesel_tank",
  stock: string,
  dailyOutflow: Decimal
): TankSummary {
  const capacity = new Decimal(20000);
  const available = new Decimal(stock || "0");
  const percentage = Math.max(0, Math.min(100, available.div(capacity).times(100).round().toNumber()));
  const status = percentage <= 20 ? "critical" : percentage <= 45 ? "watch" : "healthy";
  const days = dailyOutflow.isZero() ? "No sales rate" : `${available.div(dailyOutflow).toDecimalPlaces(1)} days`;
  return {
    id,
    name: id === "petrol_tank" ? "Tank P1" : "Tank D1",
    product: id === "petrol_tank" ? "Petrol" : "Diesel",
    litres: `${quantity.format(available.toNumber())} L`,
    capacityLitres: "20,000 L",
    percentage,
    daysRemaining: days,
    status
  };
}

export function buildDashboardViewModel(input: {
  shifts: ShiftRecord[];
  expenses: ExpenseRecord[];
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

  const petrolSold = sum(closed.map((shift) => shift.reconciliation?.nozzles.petrol_1?.customerSalesVolume));
  const dieselSold = sum(closed.map((shift) => shift.reconciliation?.nozzles.diesel_1?.customerSalesVolume));
  const totalSold = petrolSold.plus(dieselSold);
  const percentOfTotal = (value: Decimal) => totalSold.isZero() ? 0 : value.div(totalSold).times(100).round().toNumber();

  const recordedStock = active?.openingTankStocks ?? latestClosed?.closingTankStocks ?? {
    petrol_tank: "0",
    diesel_tank: "0"
  };
  const tanks = [
    tankSummary("petrol_tank", recordedStock.petrol_tank ?? "0", petrolSold),
    tankSummary("diesel_tank", recordedStock.diesel_tank ?? "0", dieselSold)
  ];

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
    fuelSold: [
      { product: "Petrol", litres: `${quantity.format(petrolSold.toNumber())} L`, percentage: percentOfTotal(petrolSold) },
      { product: "Diesel", litres: `${quantity.format(dieselSold.toNumber())} L`, percentage: percentOfTotal(dieselSold) }
    ],
    paymentMix: Object.entries(paymentAmounts).map(([method, amount]) => ({
      method,
      amount: inr.format(amount.toNumber()),
      percentage: paymentTotal.isZero() ? 0 : amount.div(paymentTotal).times(100).round().toNumber()
    })),
    alerts
  };
}
