import type { ShiftRecord } from "@/server/domain/operations";

export type OpeningCarryForward = {
  readings: Record<string, string>;
  sources: Record<string, { shiftId: string; businessDate: string }>;
};

export function deriveOpeningCarryForward(shifts: ShiftRecord[], stationIds: string[]): OpeningCarryForward {
  const wanted = new Set(stationIds); const readings: Record<string, string> = {}; const sources: OpeningCarryForward["sources"] = {};
  const closed = shifts.filter((shift) => shift.state === "CLOSED" && shift.closingNozzleReadings).sort((a, b) => (b.closedAt ?? b.startedAt).localeCompare(a.closedAt ?? a.startedAt));
  for (const shift of closed) for (const [stationId, reading] of Object.entries(shift.closingNozzleReadings ?? {})) {
    if (!wanted.has(stationId) || readings[stationId] !== undefined) continue;
    readings[stationId] = reading; sources[stationId] = { shiftId: shift.id, businessDate: shift.businessDate };
  }
  return { readings, sources };
}
