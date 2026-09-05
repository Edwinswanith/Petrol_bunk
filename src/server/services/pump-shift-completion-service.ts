import { calculatePumpShiftSummary } from "@/server/calculations/pump-shift-summary";
import type { PumpShiftCompletionInput, PumpShiftRecord, ShiftRecord } from "@/server/domain/operations";
import { pumpGroupId, pumpGroupLabel } from "@/server/domain/pump-grouping";
import { businessDate } from "@/lib/business-time";

export function applyPumpShiftCompletion(shift: ShiftRecord, pumpId: string, input: PumpShiftCompletionInput, now = new Date().toISOString()): ShiftRecord {
  if (shift.state === "CLOSED") throw new Error("Closed shifts are immutable in v1");
  const stations = (shift.stationSnapshots ?? []).filter((station) => pumpGroupId(station, station.stationId) === pumpId);
  if (!stations.length) throw new Error(`Unknown pump: ${pumpId}`);

  const stationIds = new Set(stations.map((station) => station.stationId));
  const previousEntries = (shift.pumpShiftHistory ?? []).filter((entry) => entry.pumpId === pumpId);
  const lastEntry = previousEntries[previousEntries.length - 1];
  const openingNozzleReadings = Object.fromEntries(
    stations.map((station) => [station.stationId, lastEntry?.closingNozzleReadings[station.stationId] ?? shift.openingNozzleReadings[station.stationId]])
  );

  for (const stationId of stationIds) {
    if (input.closingNozzleReadings[stationId] === undefined) throw new Error(`Missing closing reading for ${stationId}`);
  }
  const nonSaleDispenses = input.nonSaleDispenses.filter((entry) => stationIds.has(entry.nozzleId));

  const summary = calculatePumpShiftSummary({
    stations, openingReadings: openingNozzleReadings, closingReadings: input.closingNozzleReadings,
    nonSaleDispenses, collections: input.collections, staffId: input.staffId, staffName: input.staffName
  });

  const record: PumpShiftRecord = {
    id: crypto.randomUUID(), pumpId, pumpLabel: pumpGroupLabel(stations[0], pumpId),
    staffId: input.staffId, staffName: input.staffName, businessDate: businessDate(new Date(now)),
    shiftStartTime: input.shiftStartTime, shiftEndTime: input.shiftEndTime,
    openingNozzleReadings, closingNozzleReadings: input.closingNozzleReadings, nonSaleDispenses,
    collections: { cash: summary.cash, upi: summary.upi, card: summary.card, credit: summary.credit, other: summary.other, declaredCashHandover: summary.declaredCashHandover },
    litresSold: summary.litresSold, expectedSalesValue: summary.expectedSalesValue,
    accountedTender: summary.accountedTender, tenderVariance: summary.tenderVariance,
    declaredCashHandover: summary.declaredCashHandover, cashVariance: summary.cashVariance,
    products: summary.products, nozzles: summary.nozzles, completedAt: now
  };

  return { ...shift, pumpShiftHistory: [...(shift.pumpShiftHistory ?? []), record], version: shift.version + 1 };
}
