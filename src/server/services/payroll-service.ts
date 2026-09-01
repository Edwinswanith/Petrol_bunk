import Decimal from "decimal.js";

const money = (value: Decimal) => value.toDecimalPlaces(2).toFixed(2);

export function calculatePayrollSettlement(input: { baseSalary: string; overtime: string; attendanceDeduction: string; advances: string; otherDeductions: string; amountPaid: string }) {
  const parsed = Object.fromEntries(Object.entries(input).map(([key, raw]) => {
    const value = new Decimal(raw);
    if (value.isNegative()) throw new Error(`${key} cannot be negative`);
    return [key, value];
  })) as Record<keyof typeof input, Decimal>;
  const grossPay = parsed.baseSalary.plus(parsed.overtime);
  const totalDeductions = Decimal.sum(parsed.attendanceDeduction, parsed.advances, parsed.otherDeductions);
  const netPay = grossPay.minus(totalDeductions);
  if (netPay.isNegative()) throw new Error("Deductions cannot exceed gross salary");
  if (parsed.amountPaid.greaterThan(netPay)) throw new Error("Amount paid cannot exceed net salary");
  return { grossPay: money(grossPay), totalDeductions: money(totalDeductions), netPay: money(netPay), amountPaid: money(parsed.amountPaid), balanceDue: money(netPay.minus(parsed.amountPaid)) };
}
