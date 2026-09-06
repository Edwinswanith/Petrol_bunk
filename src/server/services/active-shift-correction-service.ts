import type { ActiveShiftCorrectionInput, ActiveShiftDateCorrectionInput, ActiveShiftPriceUpdateInput, ShiftCorrection, ShiftRecord } from "@/server/domain/operations";

const productRates = (shift: ShiftRecord) => Object.fromEntries((shift.stationSnapshots ?? []).map((station) => [station.productId, { sellingPricePerLitre: station.pricePerLitre, costPricePerLitre: station.costPerLitre }]));

export function applyActiveShiftCorrection(shift: ShiftRecord, input: ActiveShiftCorrectionInput, now = new Date().toISOString()): ShiftRecord {
  if (shift.state === "CLOSED") throw new Error("Closed shifts are immutable in v1");
  const revisedRates = { ...productRates(shift), ...(input.productRates ?? {}) };
  const stationSnapshots = (shift.stationSnapshots ?? []).map((station) => {
    const rate = revisedRates[station.productId];
    return rate ? { ...station, pricePerLitre: rate.sellingPricePerLitre, costPerLitre: rate.costPricePerLitre, marketReferencePrice: rate.sellingPricePerLitre } : station;
  });
  const changed = JSON.stringify(shift.openingNozzleReadings) !== JSON.stringify(input.openingNozzleReadings)
    || JSON.stringify(shift.staffAssignments ?? []) !== JSON.stringify(input.staffAssignments)
    || JSON.stringify(productRates(shift)) !== JSON.stringify(revisedRates);
  const correction: ShiftCorrection = {
    id: crypto.randomUUID(), correctedAt: now, reason: input.reason?.trim() || "Owner updated the active day",
    previousOpeningNozzleReadings: structuredClone(shift.openingNozzleReadings), revisedOpeningNozzleReadings: structuredClone(input.openingNozzleReadings),
    previousStaffAssignments: structuredClone(shift.staffAssignments ?? []), revisedStaffAssignments: structuredClone(input.staffAssignments),
    previousProductRates: productRates(shift), revisedProductRates: revisedRates
  };
  return { ...shift, openingNozzleReadings: structuredClone(input.openingNozzleReadings), staffAssignments: structuredClone(input.staffAssignments), staffOnDuty: [...new Set(input.staffAssignments.map((assignment) => assignment.staffName))], stationSnapshots, corrections: changed ? [...(shift.corrections ?? []), correction] : shift.corrections, version: shift.version + 1 };
}

export function applyActiveShiftPriceUpdate(shift: ShiftRecord, input: ActiveShiftPriceUpdateInput, now = new Date().toISOString()): ShiftRecord {
  if (shift.state === "CLOSED") throw new Error("Closed shifts are immutable in v1");
  const revisedRates = { ...productRates(shift), ...input.productRates };
  const stationSnapshots = (shift.stationSnapshots ?? []).map((station) => {
    const rate = revisedRates[station.productId];
    return rate ? { ...station, pricePerLitre: rate.sellingPricePerLitre, costPerLitre: rate.costPricePerLitre, marketReferencePrice: rate.sellingPricePerLitre } : station;
  });
  const changed = JSON.stringify(productRates(shift)) !== JSON.stringify(revisedRates);
  const correction: ShiftCorrection = {
    id: crypto.randomUUID(), correctedAt: now, reason: input.reason?.trim() || "Owner updated today's fuel prices",
    previousOpeningNozzleReadings: structuredClone(shift.openingNozzleReadings), revisedOpeningNozzleReadings: structuredClone(shift.openingNozzleReadings),
    previousStaffAssignments: structuredClone(shift.staffAssignments ?? []), revisedStaffAssignments: structuredClone(shift.staffAssignments ?? []),
    previousProductRates: productRates(shift), revisedProductRates: revisedRates
  };
  return { ...shift, stationSnapshots, corrections: changed ? [...(shift.corrections ?? []), correction] : shift.corrections, version: shift.version + 1 };
}

export function applyActiveShiftDateCorrection(shift: ShiftRecord, input: ActiveShiftDateCorrectionInput, now = new Date().toISOString()): ShiftRecord {
  if (shift.state === "CLOSED") throw new Error("Closed shifts are immutable in v1");
  if (input.businessDate === shift.businessDate) return shift;
  const correction: ShiftCorrection = {
    id: crypto.randomUUID(), correctedAt: now, reason: input.reason?.trim() || "Owner corrected the business date",
    previousOpeningNozzleReadings: structuredClone(shift.openingNozzleReadings), revisedOpeningNozzleReadings: structuredClone(shift.openingNozzleReadings),
    previousStaffAssignments: structuredClone(shift.staffAssignments ?? []), revisedStaffAssignments: structuredClone(shift.staffAssignments ?? []),
    previousProductRates: productRates(shift), revisedProductRates: productRates(shift),
    previousBusinessDate: shift.businessDate, revisedBusinessDate: input.businessDate
  };
  const pumpShiftHistory = (shift.pumpShiftHistory ?? []).map((entry) => ({ ...entry, businessDate: input.businessDate }));
  return { ...shift, businessDate: input.businessDate, pumpShiftHistory, corrections: [...(shift.corrections ?? []), correction], version: shift.version + 1 };
}
