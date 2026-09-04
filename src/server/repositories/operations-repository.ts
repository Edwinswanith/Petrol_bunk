import type { ActiveShiftCorrectionInput, CloseShiftInput, OpenShiftInput, PumpShiftCompletionInput, PumpShiftCorrectionInput, ShiftRecord } from "@/server/domain/operations";
import type { InventoryMovement, TankStockAdjustmentInput } from "@/server/domain/forecourt";

export interface OperationsRepository {
  listShifts(): Promise<ShiftRecord[]>;
  findShift(id: string): Promise<ShiftRecord | null>;
  openShift(input: OpenShiftInput, idempotencyKey: string): Promise<ShiftRecord>;
  closeShift(id: string, input: CloseShiftInput, idempotencyKey: string): Promise<ShiftRecord>;
  updateOpeningReading(id: string, nozzleId: string, reading: string): Promise<ShiftRecord>;
  updateActiveShift(id: string, input: ActiveShiftCorrectionInput): Promise<ShiftRecord>;
  completePumpShift(id: string, pumpId: string, input: PumpShiftCompletionInput): Promise<ShiftRecord>;
  correctPumpShiftEntry(id: string, pumpId: string, entryId: string, input: PumpShiftCorrectionInput): Promise<ShiftRecord>;
  getTankBalances(): Promise<Record<string, string>>;
  adjustTankStock(input: TankStockAdjustmentInput): Promise<InventoryMovement>;
  listInventoryMovements(tankId?: string): Promise<InventoryMovement[]>;
}
