import { businessDate as currentBusinessDate } from "@/lib/business-time";
import type { PumpShiftVoidInput, ShiftRecord } from "@/server/domain/operations";

export function applyPumpShiftEntryVoid(
  shift: ShiftRecord,
  pumpId: string,
  entryId: string,
  input: PumpShiftVoidInput,
  today = currentBusinessDate(),
  now = new Date().toISOString()
): ShiftRecord {
  if (shift.state === "CLOSED") throw new Error("Closed shifts are immutable in v1");
  if (shift.businessDate !== today) throw new Error("Only entries from today's open business date can be deleted");
  if (input.reason.trim().length < 2) throw new Error("Enter a reason before deleting this entry");

  const history = shift.pumpShiftHistory ?? [];
  const targetIndex = history.findIndex((entry) => entry.id === entryId && entry.pumpId === pumpId);
  if (targetIndex === -1) throw new Error("Pump shift record not found");
  const target = history[targetIndex];
  if (target.businessDate !== today) throw new Error("Only entries from today's open business date can be deleted");

  return {
    ...shift,
    pumpShiftHistory: history.filter((_, index) => index !== targetIndex),
    pumpShiftVoids: [...(shift.pumpShiftVoids ?? []), {
      id: crypto.randomUUID(), entryId: target.id, pumpId: target.pumpId, businessDate: target.businessDate,
      reason: input.reason.trim(), voidedAt: now, entry: structuredClone(target)
    }],
    version: shift.version + 1
  };
}
