import type {
  ActiveShiftCorrectionInput,
  CloseShiftInput,
  OpenShiftInput,
  PumpProgressInput,
  ShiftRecord
} from "@/server/domain/operations";
import { reconcileShift, requireVarianceExplanation } from "@/server/services/shift-reconciliation-service";
import Decimal from "decimal.js";
import type { InventoryMovement, TankStockAdjustmentInput } from "@/server/domain/forecourt";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";
import { applyActiveShiftCorrection } from "@/server/services/active-shift-correction-service";

function clone<T>(value: T): T {
  return structuredClone(value);
}

const legacyStationSnapshots = [
  { stationId: "petrol_1", code: "P1", name: "Petrol station P1", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank 1", pricePerLitre: "102.50", costPerLitre: "96.80" },
  { stationId: "diesel_1", code: "D1", name: "Diesel station D1", productId: "diesel", productName: "Diesel", tankId: "diesel_tank", tankName: "Diesel Tank 1", pricePerLitre: "100.50", costPerLitre: "94.40" }
];
const legacyTankSnapshots = [
  { tankId: "petrol_tank", code: "PT1", name: "Petrol Tank 1", productId: "petrol", productName: "Petrol", capacityLitres: "20000" },
  { tankId: "diesel_tank", code: "DT1", name: "Diesel Tank 1", productId: "diesel", productName: "Diesel", capacityLitres: "20000" }
];

function createClosedDemoShift(): ShiftRecord {
  const shift: ShiftRecord = {
    id: "shift-closed-001",
    state: "OPEN",
    name: "Morning shift",
    businessDate: "2026-08-31",
    staffOnDuty: ["Omapathy"],
    stationSnapshots: clone(legacyStationSnapshots), tankSnapshots: clone(legacyTankSnapshots),
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
    staffOnDuty: ["Nagaraj", "Kavita"],
    stationSnapshots: clone(legacyStationSnapshots), tankSnapshots: clone(legacyTankSnapshots),
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
  const tankBalances = new Map<string, string>();
  const inventoryMovements: InventoryMovement[] = [];

  if (options.seedDemoData) {
    const closed = createClosedDemoShift();
    const live = createLiveDemoShift();
    shifts.set(closed.id, closed);
    shifts.set(live.id, live);
    for (const [tankId, stock] of Object.entries(live.openingTankStocks)) tankBalances.set(tankId, stock);
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
      for (const [tankId, stock] of Object.entries(shift.openingTankStocks)) {
        tankBalances.set(tankId, stock);
        if (shift.stationSnapshots?.length) {
          const store = getForecourtConfigStore();
          const configuredTank = (await store.getConfiguration()).tanks.find((tank) => tank.id === tankId);
          if (configuredTank && !new Decimal(configuredTank.currentStock).equals(stock)) {
            const normalizedStock = new Decimal(stock).toDecimalPlaces(3).toFixed(3);
            inventoryMovements.push({ id: crypto.randomUUID(), tankId, productId: configuredTank.productId, type: "ADJUSTMENT", quantity: new Decimal(stock).minus(configuredTank.currentStock).toDecimalPlaces(3).toFixed(3), balanceAfter: normalizedStock, referenceId: shift.id, referenceLabel: `${shift.name} opening stock correction`, businessDate: shift.businessDate, createdAt: now });
            await store.setTankStock(tankId, normalizedStock);
          }
        }
      }
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
      requireVarianceExplanation(reconciliation, input.varianceExplanation);
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
      const stationById = new Map(shift.stationSnapshots?.map((station) => [station.stationId, station]) ?? []);
      for (const [tankId, tank] of Object.entries(reconciliation.tanks)) {
        const outflow = Decimal.sum(0, ...Object.entries(reconciliation.nozzles)
          .filter(([stationId]) => (stationById.get(stationId)?.tankId ?? (stationId.startsWith("petrol") ? "petrol_tank" : "diesel_tank")) === tankId)
          .map(([, nozzle]) => nozzle.expectedTankOutflow));
        const tankSnapshot = shift.tankSnapshots?.find((entry) => entry.tankId === tankId);
        inventoryMovements.push({
          id: crypto.randomUUID(), tankId, productId: tankSnapshot?.productId ?? tankId.replace(/_tank$/, ""),
          type: "SHIFT_DISPENSE", quantity: outflow.negated().toDecimalPlaces(3).toFixed(3),
          balanceAfter: tank.expectedClosingStock, referenceId: shift.id,
          referenceLabel: `${shift.name} station dispensing`, businessDate: shift.businessDate,
          createdAt: closed.closedAt!
        });
        tankBalances.set(tankId, tank.expectedClosingStock);
        const configuredTank = (await getForecourtConfigStore().getConfiguration()).tanks.find((entry) => entry.id === tankId);
        if (configuredTank) await getForecourtConfigStore().setTankStock(tankId, tank.expectedClosingStock);
      }
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
    },

    async updateActiveShift(id: string, input: ActiveShiftCorrectionInput): Promise<ShiftRecord> {
      const shift = shifts.get(id);
      if (!shift) throw new Error("Shift not found");
      const updated = applyActiveShiftCorrection(shift, input);
      shifts.set(id, updated);
      for (const [productId, rate] of Object.entries(input.productRates ?? {})) {
        try { await getForecourtConfigStore().updateProductPrice(productId, { ...rate, marketReferencePrice: rate.sellingPricePerLitre }); } catch { /* Snapshot-only custom test data. */ }
      }
      return clone(updated);
    },

    async saveShiftPumpProgress(id: string, pumpId: string, input: PumpProgressInput): Promise<ShiftRecord> {
      const shift = shifts.get(id);
      if (!shift) throw new Error("Shift not found");
      if (shift.state === "CLOSED") throw new Error("Closed shifts are immutable in v1");
      const entry = { pumpId, ...input, savedAt: new Date().toISOString() };
      const updated = { ...shift, pumpProgress: { ...(shift.pumpProgress ?? {}), [pumpId]: entry }, version: shift.version + 1 };
      shifts.set(id, updated);
      return clone(updated);
    },

    async getTankBalances() {
      return Object.fromEntries(tankBalances);
    },

    async adjustTankStock(input: TankStockAdjustmentInput) {
      const store = getForecourtConfigStore();
      const tank = (await store.getConfiguration()).tanks.find((entry) => entry.id === input.tankId && entry.active);
      if (!tank) throw new Error("Fuel tank not found");
      if (!new Decimal(tank.currentStock).equals(input.previousStock)) {
        throw new Error("Tank stock changed on another device. Refresh and try again.");
      }
      const currentStock = new Decimal(input.currentStock).toDecimalPlaces(3).toFixed(3);
      if (new Decimal(currentStock).greaterThan(tank.capacityLitres)) {
        throw new Error(`Stock cannot exceed the ${tank.capacityLitres} litre tank capacity`);
      }
      const now = new Date().toISOString();
      const movement: InventoryMovement = {
        id: crypto.randomUUID(),
        tankId: tank.id,
        productId: tank.productId,
        type: "ADJUSTMENT",
        quantity: new Decimal(currentStock).minus(tank.currentStock).toDecimalPlaces(3).toFixed(3),
        balanceAfter: currentStock,
        referenceId: crypto.randomUUID(),
        referenceLabel: `Manual stock adjustment · ${input.reason}`,
        businessDate: input.businessDate,
        createdAt: now
      };
      await store.setTankStock(tank.id, currentStock);
      tankBalances.set(tank.id, currentStock);
      inventoryMovements.push(movement);
      return clone(movement);
    },

    async listInventoryMovements(tankId?: string) {
      const movements = [...inventoryMovements, ...(globalThis.forecourtReceiptInventoryMovements ?? [])];
      return clone(movements.filter((movement) => !tankId || movement.tankId === tankId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    }
  };
}

export type MemoryOperationsRepository = ReturnType<typeof createMemoryOperationsRepository>;
