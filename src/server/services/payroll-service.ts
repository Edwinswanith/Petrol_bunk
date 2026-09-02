import Decimal from "decimal.js";

const money = (value: Decimal) => value.toDecimalPlaces(2).toFixed(2);

export function calculatePayrollSettlement(input: { baseSalary: string; dailyBetaRate: string; eligibleBetaDays: number; halfDays: number; overtime: string; attendanceDeduction: string; advances: string; otherDeductions: string; amountPaid: string }) {
  const moneyInputs = { baseSalary: input.baseSalary, dailyBetaRate: input.dailyBetaRate, overtime: input.overtime, attendanceDeduction: input.attendanceDeduction, advances: input.advances, otherDeductions: input.otherDeductions, amountPaid: input.amountPaid };
  const parsed = Object.fromEntries(Object.entries(moneyInputs).map(([key, raw]) => {
    const value = new Decimal(raw);
    if (value.isNegative()) throw new Error(`${key} cannot be negative`);
    return [key, value];
  })) as Record<keyof typeof moneyInputs, Decimal>;
  if (!Number.isInteger(input.eligibleBetaDays) || input.eligibleBetaDays < 0) throw new Error("Eligible beta days must be a non-negative whole number");
  if (!Number.isInteger(input.halfDays) || input.halfDays < 0) throw new Error("Half days must be a non-negative whole number");
  if (input.halfDays > input.eligibleBetaDays) throw new Error("Half days cannot exceed worked attendance days");
  const betaDays = new Decimal(input.eligibleBetaDays).minus(new Decimal(input.halfDays).dividedBy(2));
  const betaEarned = parsed.dailyBetaRate.times(betaDays);
  const grossPay = Decimal.sum(parsed.baseSalary, betaEarned, parsed.overtime);
  const totalDeductions = Decimal.sum(parsed.attendanceDeduction, parsed.advances, parsed.otherDeductions);
  const netPay = grossPay.minus(totalDeductions);
  if (netPay.isNegative()) throw new Error("Deductions cannot exceed gross salary");
  if (parsed.amountPaid.greaterThan(netPay)) throw new Error("Amount paid cannot exceed net salary");
  return { dailyBetaRate: money(parsed.dailyBetaRate), betaDays: betaDays.toNumber(), betaEarned: money(betaEarned), grossPay: money(grossPay), totalDeductions: money(totalDeductions), netPay: money(netPay), amountPaid: money(parsed.amountPaid), balanceDue: money(netPay.minus(parsed.amountPaid)) };
}
