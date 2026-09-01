import Decimal from "decimal.js";

import type { ShiftRecord } from "@/server/domain/operations";
import type { StaffRecord } from "@/server/domain/staff";
import type { ExpenseRecord } from "@/server/repositories/journal-store";

type Totals = { litres: Decimal; revenue: Decimal; cost: Decimal };
const zero = (): Totals => ({ litres: new Decimal(0), revenue: new Decimal(0), cost: new Decimal(0) });
const money = (value: Decimal) => value.toDecimalPlaces(2).toFixed(2);
const volume = (value: Decimal) => value.toDecimalPlaces(3).toFixed(3);

export function buildFinanceAnalytics(input: { month: string; shifts: ShiftRecord[]; expenses: ExpenseRecord[]; staff: StaffRecord[] }) {
  const shifts = input.shifts.filter((shift) => shift.businessDate.startsWith(input.month) && shift.reconciliation);
  const expenses = input.expenses.filter((expense) => expense.date.startsWith(input.month));
  const productTotals = new Map<string, Totals & { productId: string; productName: string }>();
  const staffTotals = new Map<string, Totals & { staffId: string; staffName: string; productLitres: Map<string, Decimal> }>();

  for (const shift of shifts) {
    const stationById = new Map((shift.stationSnapshots ?? []).map((station) => [station.stationId, station]));
    const assignmentByNozzle = new Map((shift.staffAssignments ?? []).map((assignment) => [assignment.nozzleId, assignment]));
    for (const [nozzleId, nozzle] of Object.entries(shift.reconciliation?.nozzles ?? {})) {
      const station = stationById.get(nozzleId);
      if (!station) continue;
      const litres = new Decimal(nozzle.customerSalesVolume);
      const revenue = new Decimal(nozzle.revenue);
      const cost = litres.times(station.costPerLitre);
      const product = productTotals.get(station.productId) ?? { ...zero(), productId: station.productId, productName: station.productName };
      product.litres = product.litres.plus(litres); product.revenue = product.revenue.plus(revenue); product.cost = product.cost.plus(cost);
      productTotals.set(station.productId, product);

      const assignment = assignmentByNozzle.get(nozzleId);
      if (!assignment) continue;
      const person = staffTotals.get(assignment.staffId) ?? { ...zero(), staffId: assignment.staffId, staffName: assignment.staffName, productLitres: new Map<string, Decimal>() };
      person.litres = person.litres.plus(litres); person.revenue = person.revenue.plus(revenue); person.cost = person.cost.plus(cost);
      person.productLitres.set(station.productId, (person.productLitres.get(station.productId) ?? new Decimal(0)).plus(litres));
      staffTotals.set(assignment.staffId, person);
    }
  }

  const revenue = Decimal.sum(0, ...shifts.map((shift) => shift.reconciliation?.sales.expectedSales ?? "0"));
  const grossMargin = Decimal.sum(0, ...shifts.map((shift) => shift.reconciliation?.grossMargin ?? "0"));
  const nonSalaryExpenses = Decimal.sum(0, ...expenses.filter((expense) => expense.category !== "salary").map((expense) => expense.amount));
  const recordedSalaryPayments = Decimal.sum(0, ...expenses.filter((expense) => expense.category === "salary").map((expense) => expense.amount));
  const salaryBudget = Decimal.sum(0, ...input.staff.filter((person) => person.active).map((person) => person.monthlySalary ?? "0"));

  const dates = [...new Set([...shifts.map((shift) => shift.businessDate), ...expenses.map((expense) => expense.date)])].sort().reverse();
  const days = dates.map((businessDate) => {
    const dayShifts = shifts.filter((shift) => shift.businessDate === businessDate);
    const dayExpenses = expenses.filter((expense) => expense.date === businessDate);
    const dayRevenue = Decimal.sum(0, ...dayShifts.map((shift) => shift.reconciliation?.sales.expectedSales ?? "0"));
    const dayMargin = Decimal.sum(0, ...dayShifts.map((shift) => shift.reconciliation?.grossMargin ?? "0"));
    const dayExpense = Decimal.sum(0, ...dayExpenses.filter((expense) => expense.category !== "salary").map((expense) => expense.amount));
    const salaryPayments = Decimal.sum(0, ...dayExpenses.filter((expense) => expense.category === "salary").map((expense) => expense.amount));
    return { businessDate, revenue: money(dayRevenue), grossMargin: money(dayMargin), expenses: money(dayExpense), salaryPayments: money(salaryPayments), operatingProfitBeforeSalary: money(dayMargin.minus(dayExpense)), shifts: dayShifts.length };
  });

  const expenseCategories = [...new Set(expenses.map((expense) => expense.category))].sort().map((category) => ({
    category, amount: money(Decimal.sum(0, ...expenses.filter((expense) => expense.category === category).map((expense) => expense.amount)))
  }));

  return {
    month: input.month,
    summary: { revenue: money(revenue), grossMargin: money(grossMargin), nonSalaryExpenses: money(nonSalaryExpenses), salaryBudget: money(salaryBudget), recordedSalaryPayments: money(recordedSalaryPayments), estimatedNetProfit: money(grossMargin.minus(nonSalaryExpenses).minus(salaryBudget)) },
    products: [...productTotals.values()].sort((a, b) => a.productName.localeCompare(b.productName)).map((product) => ({ productId: product.productId, productName: product.productName, litres: volume(product.litres), revenue: money(product.revenue), cost: money(product.cost), grossProfit: money(product.revenue.minus(product.cost)) })),
    staff: [...staffTotals.values()].sort((a, b) => a.staffName.localeCompare(b.staffName)).map((person) => ({ staffId: person.staffId, staffName: person.staffName, litres: volume(person.litres), revenue: money(person.revenue), grossProfit: money(person.revenue.minus(person.cost)), productLitres: Object.fromEntries([...person.productLitres].map(([id, value]) => [id, volume(value)])) })),
    days,
    expenseCategories,
    expenses
  };
}
