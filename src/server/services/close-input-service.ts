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

  let canonicalPayments = structuredClone(input.payments);
  let canonicalStaffHandovers = structuredClone(input.staffHandovers);
  if (input.sideCollections) {
    const stationsBySide = new Map<string, NonNullable<ShiftRecord["stationSnapshots"]>>();
    for (const station of shift.stationSnapshots ?? []) {
      const sideId = station.sideId ?? station.stationId;
      stationsBySide.set(sideId, [...(stationsBySide.get(sideId) ?? []), station]);
    }
    for (const sideId of Object.keys(input.sideCollections)) {
      if (!stationsBySide.has(sideId)) throw new Error(`Unknown pump side: ${sideId}`);
    }
    for (const sideId of stationsBySide.keys()) {
      if (!input.sideCollections[sideId]) throw new Error(`Enter collections for pump side ${sideId}`);
    }

    const totals = {
      cash: new Decimal(0), upi: new Decimal(0), card: new Decimal(0), credit: new Decimal(0),
      other: new Decimal(0), declaredCashHandover: new Decimal(0)
    };
    const staffTotals = new Map<string, Decimal>();
    for (const [sideId, stations] of stationsBySide) {
      const collection = input.sideCollections[sideId];
      if (!collection) continue;
      totals.cash = totals.cash.plus(collection.cash);
      totals.upi = totals.upi.plus(collection.upi);
      totals.card = totals.card.plus(collection.card);
      totals.credit = totals.credit.plus(collection.credit);
      totals.other = totals.other.plus(collection.other);
      totals.declaredCashHandover = totals.declaredCashHandover.plus(collection.declaredCashHandover);

      const nozzleIds = new Set(stations.map((station) => station.stationId));
      const assignment = (shift.staffAssignments ?? []).find((item) => nozzleIds.has(item.nozzleId));
      if (assignment) {
        const tender = Decimal.sum(collection.cash, collection.upi, collection.card, collection.credit, collection.other);
        staffTotals.set(assignment.staffId, (staffTotals.get(assignment.staffId) ?? new Decimal(0)).plus(tender));
      }
    }
    canonicalPayments = {
      ...canonicalPayments,
      cashSales: totals.cash.toString(),
      upi: totals.upi.toString(),
      card: totals.card.toString(),
      credit: totals.credit.toString(),
      other: totals.other.toString(),
      declaredCashHandover: totals.declaredCashHandover.toString()
    };
    canonicalStaffHandovers = Object.fromEntries(
      [...staffTotals].map(([staffId, total]) => [staffId, total.toString()])
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
      ...canonicalPayments,
      cashExpenses: cashExpenseTotal.toString()
    },
    staffHandovers: canonicalStaffHandovers,
    expenses: expenseTotal.toString()
  };
}
