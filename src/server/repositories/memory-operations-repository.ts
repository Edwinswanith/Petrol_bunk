import type {
  CloseShiftInput,
  OpenShiftInput,
  ShiftRecord
} from "@/server/domain/operations";
import { reconcileShift } from "@/server/services/shift-reconciliation-service";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createClosedDemoShift(): ShiftRecord {
  const shift: ShiftRecord = {
    id: "shift-closed-001",
    state: "OPEN",
    name: "Morning shift",
    businessDate: "2026-08-31",
    staffOnDuty: ["Arun"],
    openingNozzleReadings: { petrol_1: "180000.000", diesel_1: "90000.000" },
    openingTankStocks: { petrol_tank: "15700", diesel_tank: "11100" },
    createdAt: "2026-08-31T03:30:00.000Z",
    startedAt: "2026-08-31T03:30:00.000Z",
    version: 1
  };
  const closingInput: CloseShiftInput = {
    closingNozzleReadings: { petrol_1: "183240.000", diesel_1: "92097.015" },
    closingTankStocks: { petrol_tank: "12460", diesel_tank: "9002.985" },
    nonSaleDispenses: [],
    receipts: { petrol_tank: "0", diesel_tank: "0" },
    payments: {
      cashSales: "186850",
      upi: "242000",
      card: "104000",
      credit: "10000",
      other: "0",
      cashReceipts: "0",
      cashExpenses: "1850",
      cashRemovals: "0",
      declaredCashHandover: "185000"
    },
    lubricantRevenue: "0",
    lubricantCost: "0",
    expenses: "6350",
    varianceExplanation: "Closed without variance."
  };
  return {
    ...shift,
    state: "CLOSED",
    closingNozzleReadings: clone(closingInput.closingNozzleReadings),
    closingTankStocks: clone(closingInput.closingTankStocks),
    closingInput: clone(closingInput),
    closedAt: "2026-08-31T11:30:00.000Z",
    version: 2,
    reconciliation: reconcileShift(shift, closingInput),
    varianceExplanation: closingInput.varianceExplanation
  };
}

function createLiveDemoShift(): ShiftRecord {
  return {
    id: "shift-live-001",
    state: "OPEN",
    name: "Evening shift",
    businessDate: "2026-08-31",
    staffOnDuty: ["Kumar", "Ravi"],
    openingNozzleReadings: { petrol_1: "183240.000", diesel_1: "92097.015" },
    openingTankStocks: { petrol_tank: "12460", diesel_tank: "9002.985" },
    createdAt: "2026-08-31T11:30:00.000Z",
    startedAt: "2026-08-31T11:30:00.000Z",
    version: 1
  };
}

export function createMemoryOperationsRepository(options: { seedDemoData: boolean }) {
  const shifts = new Map<string, ShiftRecord>();
  const idempotency = new Map<string, ShiftRecord>();

  if (options.seedDemoData) {
    const closed = createClosedDemoShift();
    const live = createLiveDemoShift();
    shifts.set(closed.id, closed);
    shifts.set(live.id, live);
  }

  return {
    async listShifts(): Promise<ShiftRecord[]> {
      return [...shifts.values()]
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .map(clone);
    },

    async findShift(id: string): Promise<ShiftRecord | null> {
      const shift = shifts.get(id);
      return shift ? clone(shift) : null;
    },

    async openShift(input: OpenShiftInput, idempotencyKey: string): Promise<ShiftRecord> {
      const cacheKey = `open:${idempotencyKey}`;
      const existing = idempotency.get(cacheKey);
      if (existing) return clone(existing);
      const activeShift = [...shifts.values()].find((shift) => shift.state === "OPEN");
      if (activeShift) throw new Error("Close the active shift before opening another");

      const now = new Date().toISOString();
      const shift: ShiftRecord = {
        ...clone(input),
        id: crypto.randomUUID(),
        state: "OPEN",
        createdAt: now,
        startedAt: now,
        version: 1
      };
      shifts.set(shift.id, shift);
      idempotency.set(cacheKey, shift);
      return clone(shift);
    },

    async closeShift(
      id: string,
      input: CloseShiftInput,
      idempotencyKey: string
    ): Promise<ShiftRecord> {
      const cacheKey = `close:${idempotencyKey}`;
      const replay = idempotency.get(cacheKey);
      if (replay) return clone(replay);

      const shift = shifts.get(id);
      if (!shift) throw new Error("Shift not found");
      if (shift.state === "CLOSED") {
        throw new Error("Shift is already closed");
      }

      const reconciliation = reconcileShift(shift, input);
      const closed: ShiftRecord = {
        ...shift,
        state: "CLOSED",
        closingNozzleReadings: clone(input.closingNozzleReadings),
        closingTankStocks: clone(input.closingTankStocks),
        closingInput: clone(input),
        closedAt: new Date().toISOString(),
        version: shift.version + 1,
        reconciliation,
        varianceExplanation: input.varianceExplanation
      };
      shifts.set(id, closed);
      idempotency.set(cacheKey, closed);
      return clone(closed);
    },

    async updateOpeningReading(id: string, nozzleId: string, reading: string): Promise<ShiftRecord> {
      const shift = shifts.get(id);
      if (!shift) throw new Error("Shift not found");
      if (shift.state === "CLOSED") {
        throw new Error("Closed shifts are immutable in v1");
      }
      const updated = {
        ...shift,
        openingNozzleReadings: { ...shift.openingNozzleReadings, [nozzleId]: reading },
        version: shift.version + 1
      };
      shifts.set(id, updated);
      return clone(updated);
    }
  };
}

export type MemoryOperationsRepository = ReturnType<typeof createMemoryOperationsRepository>;
