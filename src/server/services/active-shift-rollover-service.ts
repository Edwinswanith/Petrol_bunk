import type { ShiftRecord } from "@/server/domain/operations";
import { pumpGroupId } from "@/server/domain/pump-grouping";

function nextBusinessDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function completedForDate(shift: ShiftRecord, date: string, requiredByPump: Map<string, Set<string>>) {
  const completedByPump = new Map<string, Set<string>>();

  for (const entry of shift.pumpShiftHistory ?? []) {
    if (entry.businessDate !== date || !requiredByPump.has(entry.pumpId)) continue;
    const completed = completedByPump.get(entry.pumpId) ?? new Set<string>();
    for (const nozzleId of entry.nozzleIds ?? Object.keys(entry.closingNozzleReadings)) completed.add(nozzleId);
    completedByPump.set(entry.pumpId, completed);
  }

  return [...requiredByPump].every(([pumpId, requiredNozzles]) => {
    const completed = completedByPump.get(pumpId);
    return completed !== undefined && [...requiredNozzles].every((nozzleId) => completed.has(nozzleId));
  });
}

/**
 * Returns the newest safe business date for an open shift, or null when no
 * rollover is allowed. Completed pump records remain on their original dates.
 */
export function automaticBusinessDateRollover(shift: ShiftRecord, today: string): string | null {
  if (shift.state !== "OPEN" || shift.businessDate >= today) return null;

  const requiredByPump = new Map<string, Set<string>>();
  for (const station of shift.stationSnapshots ?? []) {
    const pumpId = pumpGroupId(station, station.stationId);
    const nozzleIds = requiredByPump.get(pumpId) ?? new Set<string>();
    nozzleIds.add(station.stationId);
    requiredByPump.set(pumpId, nozzleIds);
  }
  if (!requiredByPump.size) return null;

  let candidate = shift.businessDate;
  while (candidate < today && completedForDate(shift, candidate, requiredByPump)) {
    const next = nextBusinessDate(candidate);
    if (!next || next > today) break;
    candidate = next;
  }

  return candidate === shift.businessDate ? null : candidate;
}
