import Decimal from "decimal.js";

import type { CloseShiftInput, ShiftRecord } from "@/server/domain/operations";
import { listExpenses, listFuelReceipts } from "@/server/repositories/journal-store";

function belongsToShift(record: { shiftId?: string; createdAt: string }, shift: ShiftRecord) {
  return record.shiftId ? record.shiftId === shift.id : record.createdAt >= shift.startedAt;
}

export async function prepareCloseInput(
  shift: ShiftRecord,
  input: CloseShiftInput
): Promise<CloseShiftInput> {
  const [expenses, receipts] = await Promise.all([listExpenses(), listFuelReceipts()]);
  const shiftExpenses = expenses.filter(
    (expense) => expense.date === shift.businessDate && belongsToShift(expense, shift)
  );
  const shiftReceipts = receipts.filter((receipt) => belongsToShift(receipt, shift));
  const expenseTotal = Decimal.sum(0, ...shiftExpenses.map((expense) => expense.amount));
  const cashExpenseTotal = Decimal.sum(
    0,
    ...shiftExpenses.filter((expense) => expense.paymentMethod === "cash").map((expense) => expense.amount)
  );

  const receiptTotals: Record<string, Decimal> = {};
  for (const receipt of shiftReceipts) {
    receiptTotals[receipt.tankId] = (receiptTotals[receipt.tankId] ?? new Decimal(0)).plus(
      receipt.acceptedQuantity
    );
  }

  return {
    ...structuredClone(input),
    receipts: Object.fromEntries(
      Object.entries(shift.openingTankStocks).map(([tankId]) => [
        tankId,
        (receiptTotals[tankId] ?? new Decimal(0)).toString()
      ])
    ),
    payments: {
      ...structuredClone(input.payments),
      cashExpenses: cashExpenseTotal.toString()
    },
    expenses: expenseTotal.toString()
  };
}
