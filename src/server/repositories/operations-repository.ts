import type { CloseShiftInput, OpenShiftInput, ShiftRecord } from "@/server/domain/operations";

export interface OperationsRepository {
  listShifts(): Promise<ShiftRecord[]>;
  findShift(id: string): Promise<ShiftRecord | null>;
  openShift(input: OpenShiftInput, idempotencyKey: string): Promise<ShiftRecord>;
  closeShift(id: string, input: CloseShiftInput, idempotencyKey: string): Promise<ShiftRecord>;
  updateOpeningReading(id: string, nozzleId: string, reading: string): Promise<ShiftRecord>;
}
