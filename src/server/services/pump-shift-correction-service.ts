import { calculatePumpShiftSummary } from "@/server/calculations/pump-shift-summary";
import { CalculationError } from "@/server/calculations/reconciliation";
import type { PumpShiftCorrection, PumpShiftCorrectionInput, PumpShiftRecord, ShiftRecord, StationSnapshot } from "@/server/domain/operations";
import { pumpGroupId } from "@/server/domain/pump-grouping";

function recomputeEntry(
  base: PumpShiftRecord,
  stations: StationSnapshot[],
  openingNozzleReadings: Record<string, string>,
  closingNozzleReadings: Record<string, string>,
  nonSaleDispenses: PumpShiftRecord["nonSaleDispenses"],
  collections: PumpShiftRecord["collections"] | undefined,
  staffId: string,
  staffName: string,
  shiftStartTime: string | undefined,
  shiftEndTime: string | undefined
): PumpShiftRecord {
  const summary = calculatePumpShiftSummary({ stations, openingReadings: openingNozzleReadings, closingReadings: closingNozzleReadings, nonSaleDispenses, collections, staffId, staffName });
  return {
    ...base,
    staffId, staffName, shiftStartTime, shiftEndTime,
    openingNozzleReadings, closingNozzleReadings, nonSaleDispenses,
    collections: { cash: summary.cash, upi: summary.upi, card: summary.card, credit: summary.credit, other: summary.other, declaredCashHandover: summary.declaredCashHandover },
    litresSold: summary.litresSold, expectedSalesValue: summary.expectedSalesValue,
    accountedTender: summary.accountedTender, tenderVariance: summary.tenderVariance,
    declaredCashHandover: summary.declaredCashHandover, cashVariance: summary.cashVariance,
    products: summary.products, nozzles: summary.nozzles
  };
}

export function applyPumpShiftEntryCorrection(shift: ShiftRecord, pumpId: string, entryId: string, input: PumpShiftCorrectionInput, now = new Date().toISOString()): ShiftRecord {
  if (shift.state === "CLOSED") throw new Error("Closed shifts are immutable in v1");
  const stations = (shift.stationSnapshots ?? []).filter((station) => pumpGroupId(station, station.stationId) === pumpId);
  if (!stations.length) throw new Error(`Unknown pump: ${pumpId}`);
  const stationIds = new Set(stations.map((station) => station.stationId));

  const history = shift.pumpShiftHistory ?? [];
  const targetIndex = history.findIndex((entry) => entry.id === entryId && entry.pumpId === pumpId);
  if (targetIndex === -1) throw new Error("Pump shift record not found");
  const target = history[targetIndex];

  for (const stationId of stationIds) {
    if (input.closingNozzleReadings[stationId] === undefined) throw new Error(`Missing closing reading for ${stationId}`);
  }
  const nonSaleDispenses = input.nonSaleDispenses.filter((entry) => stationIds.has(entry.nozzleId));

  const correctedEntry = recomputeEntry(
    target, stations, target.openingNozzleReadings, input.closingNozzleReadings, nonSaleDispenses,
    input.collections, input.staffId, input.staffName, input.shiftStartTime, input.shiftEndTime
  );

  const changed = JSON.stringify(target.closingNozzleReadings) !== JSON.stringify(correctedEntry.closingNozzleReadings)
    || JSON.stringify(target.nonSaleDispenses) !== JSON.stringify(correctedEntry.nonSaleDispenses)
    || JSON.stringify(target.collections) !== JSON.stringify(correctedEntry.collections)
    || target.staffId !== correctedEntry.staffId
    || target.staffName !== correctedEntry.staffName
    || (target.shiftStartTime ?? "") !== (correctedEntry.shiftStartTime ?? "")
    || (target.shiftEndTime ?? "") !== (correctedEntry.shiftEndTime ?? "");

  const correction: PumpShiftCorrection = {
    id: crypto.randomUUID(), correctedAt: now, reason: input.reason.trim(),
    previousClosingNozzleReadings: target.closingNozzleReadings, revisedClosingNozzleReadings: correctedEntry.closingNozzleReadings,
    previousNonSaleDispenses: target.nonSaleDispenses, revisedNonSaleDispenses: correctedEntry.nonSaleDispenses,
    previousCollections: target.collections, revisedCollections: correctedEntry.collections,
    previousStaffId: target.staffId, revisedStaffId: correctedEntry.staffId,
    previousStaffName: target.staffName, revisedStaffName: correctedEntry.staffName,
    previousShiftStartTime: target.shiftStartTime, revisedShiftStartTime: correctedEntry.shiftStartTime,
    previousShiftEndTime: target.shiftEndTime, revisedShiftEndTime: correctedEntry.shiftEndTime
  };

  const finalTarget: PumpShiftRecord = { ...correctedEntry, corrections: changed ? [...(target.corrections ?? []), correction] : target.corrections };

  const pumpEntryIndices = history.map((entry, index) => (entry.pumpId === pumpId ? index : -1)).filter((index) => index !== -1);
  const positionInPump = pumpEntryIndices.indexOf(targetIndex);
  const laterIndices = pumpEntryIndices.slice(positionInPump + 1);

  const nextHistory = [...history];
  nextHistory[targetIndex] = finalTarget;

  let previousClosing = finalTarget.closingNozzleReadings;
  for (const index of laterIndices) {
    const entry = nextHistory[index];
    const newOpening = Object.fromEntries(stations.map((station) => [station.stationId, previousClosing[station.stationId] ?? entry.openingNozzleReadings[station.stationId]]));
    const openingChanged = JSON.stringify(entry.openingNozzleReadings) !== JSON.stringify(newOpening);
    if (!openingChanged) { previousClosing = entry.closingNozzleReadings; continue; }

    let recomputed: PumpShiftRecord;
    try {
      recomputed = recomputeEntry(entry, stations, newOpening, entry.closingNozzleReadings, entry.nonSaleDispenses, entry.collections, entry.staffId, entry.staffName, entry.shiftStartTime, entry.shiftEndTime);
    } catch (error) {
      if (error instanceof CalculationError) {
        throw new CalculationError(`Correcting this segment would make ${entry.staffName}'s later shift (${entry.shiftStartTime ?? "unlabelled"}–${entry.shiftEndTime ?? "unlabelled"}) invalid: ${error.message}`);
      }
      throw error;
    }
    nextHistory[index] = { ...recomputed, cascadeAdjustment: { fromEntryId: entryId, adjustedAt: now } };
    previousClosing = recomputed.closingNozzleReadings;
  }

  return { ...shift, pumpShiftHistory: nextHistory, version: shift.version + 1 };
}
