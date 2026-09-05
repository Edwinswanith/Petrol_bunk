import { MongoServerError } from "mongodb";
import Decimal from "decimal.js";

import { getMongoClient, getMongoDatabase } from "@/server/db/mongo-client";
import type { ShiftRecord } from "@/server/domain/operations";
import type { FuelTank, InventoryMovement } from "@/server/domain/forecourt";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";
import type { OperationsRepository } from "@/server/repositories/operations-repository";
import { reconcileShift, requireVarianceExplanation } from "@/server/services/shift-reconciliation-service";
import { applyActiveShiftCorrection, applyActiveShiftPriceUpdate } from "@/server/services/active-shift-correction-service";
import { applyPumpShiftCompletion } from "@/server/services/pump-shift-completion-service";
import { applyPumpShiftEntryCorrection } from "@/server/services/pump-shift-correction-service";

type StoredShift = ShiftRecord & { _id: string };
type IdempotencyRecord = { _id: string; shiftId: string; createdAt: Date };

let indexesReady: Promise<void> | undefined;

function withoutId(record: StoredShift): ShiftRecord {
  const { _id, ...shift } = record;
  void _id;
  return structuredClone(shift);
}

async function ensureIndexes() {
  if (!indexesReady) {
    indexesReady = (async () => {
      const database = await getMongoDatabase();
      await Promise.all([
        database.collection<StoredShift>("shifts").createIndex({ businessDate: -1, startedAt: -1 }),
        database.collection<StoredShift>("shifts").createIndex({ state: 1, businessDate: -1 }),
        database.collection<StoredShift>("shifts").createIndex(
          { state: 1 },
          { unique: true, partialFilterExpression: { state: "OPEN" }, name: "one_open_shift" }
        ),
        database.collection<IdempotencyRecord>("idempotency").createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 }),
        database.collection<InventoryMovement>("inventoryMovements").createIndex({ referenceId: 1, tankId: 1, type: 1 }, { unique: true }),
        database.collection<InventoryMovement>("inventoryMovements").createIndex({ tankId: 1, createdAt: -1 })
      ]);
    })();
  }
  return indexesReady;
}

export function createMongoOperationsRepository(): OperationsRepository {
  return {
    async listShifts() {
      await ensureIndexes();
      const database = await getMongoDatabase();
      const records = await database.collection<StoredShift>("shifts").find().sort({ startedAt: -1 }).limit(100).toArray();
      return records.map(withoutId);
    },

    async findShift(id) {
      await ensureIndexes();
      const database = await getMongoDatabase();
      const record = await database.collection<StoredShift>("shifts").findOne({ _id: id });
      return record ? withoutId(record) : null;
    },

    async openShift(input, idempotencyKey) {
      await ensureIndexes();
      await getForecourtConfigStore().getConfiguration();
      const client = await getMongoClient();
      const database = await getMongoDatabase();
      const session = client.startSession();
      const idempotencyId = `shift:open:${idempotencyKey}`;
      let result: ShiftRecord | undefined;

      try {
        await session.withTransaction(async () => {
          const existing = await database.collection<IdempotencyRecord>("idempotency").findOne(
            { _id: idempotencyId },
            { session }
          );
          if (existing) {
            const replay = await database.collection<StoredShift>("shifts").findOne(
              { _id: existing.shiftId },
              { session }
            );
            if (replay) result = withoutId(replay);
            return;
          }

          const now = new Date().toISOString();
          const shift: ShiftRecord = { ...structuredClone(input), id: crypto.randomUUID(), state: "OPEN", createdAt: now, startedAt: now, version: 1 };
          await database.collection<StoredShift>("shifts").insertOne({ ...shift, _id: shift.id }, { session });
          if (shift.stationSnapshots?.length) {
            for (const tankSnapshot of shift.tankSnapshots ?? []) {
              const openingStock = new Decimal(shift.openingTankStocks[tankSnapshot.tankId]).toDecimalPlaces(3).toFixed(3);
              const tank = await database.collection<FuelTank>("fuelTanks").findOne({ id: tankSnapshot.tankId, active: true }, { session });
              if (!tank) throw new Error(`Fuel tank not found for opening: ${tankSnapshot.tankId}`);
              if (!new Decimal(tank.currentStock).equals(openingStock)) {
                const update = await database.collection<FuelTank>("fuelTanks").updateOne({ id: tank.id, currentStock: tank.currentStock }, { $set: { currentStock: openingStock, updatedAt: now } }, { session });
                if (update.modifiedCount !== 1) throw new Error(`Tank stock changed while opening ${tank.name}. Refresh and try again.`);
                await database.collection<InventoryMovement>("inventoryMovements").insertOne({ id: crypto.randomUUID(), tankId: tank.id, productId: tank.productId, type: "ADJUSTMENT", quantity: new Decimal(openingStock).minus(tank.currentStock).toDecimalPlaces(3).toFixed(3), balanceAfter: openingStock, referenceId: shift.id, referenceLabel: `${shift.name} opening stock correction`, businessDate: shift.businessDate, createdAt: now }, { session });
              }
            }
          }
          await database.collection<IdempotencyRecord>("idempotency").insertOne(
            { _id: idempotencyId, shiftId: shift.id, createdAt: new Date() },
            { session }
          );
          result = shift;
        });
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) {
          const winner = await database.collection<IdempotencyRecord>("idempotency").findOne({ _id: idempotencyId });
          if (winner) {
            const replay = await database.collection<StoredShift>("shifts").findOne({ _id: winner.shiftId });
            if (replay) return withoutId(replay);
          }
          throw new Error("Close the active shift before opening another");
        }
        throw error;
      } finally {
        await session.endSession();
      }

      if (!result) throw new Error("Shift opening did not complete");
      return result;
    },

    async closeShift(id, input, idempotencyKey) {
      await ensureIndexes();
      await getForecourtConfigStore().getConfiguration();
      const client = await getMongoClient();
      const database = await getMongoDatabase();
      const session = client.startSession();
      const idempotencyId = `shift:close:${idempotencyKey}`;
      let result: ShiftRecord | undefined;

      try {
        await session.withTransaction(async () => {
          const existing = await database.collection<IdempotencyRecord>("idempotency").findOne({ _id: idempotencyId }, { session });
          if (existing) {
            const replay = await database.collection<StoredShift>("shifts").findOne({ _id: existing.shiftId }, { session });
            if (replay) result = withoutId(replay);
            return;
          }

          const stored = await database.collection<StoredShift>("shifts").findOne({ _id: id }, { session });
          if (!stored) throw new Error("Shift not found");
          const shift = withoutId(stored);
          if (shift.state === "CLOSED") throw new Error("Shift is already closed");
          const reconciliation = reconcileShift(shift, input);
          requireVarianceExplanation(reconciliation, input.varianceExplanation);
          const closed: ShiftRecord = {
            ...shift,
            state: "CLOSED",
            closingNozzleReadings: structuredClone(input.closingNozzleReadings),
            closingTankStocks: structuredClone(input.closingTankStocks),
            closingInput: structuredClone(input),
            closedAt: new Date().toISOString(),
            version: shift.version + 1,
            reconciliation,
            varianceExplanation: input.varianceExplanation
          };
          const update = await database.collection<StoredShift>("shifts").replaceOne(
            { _id: id, version: shift.version, state: "OPEN" },
            { ...closed },
            { session }
          );
          if (update.modifiedCount !== 1) throw new Error("Shift changed on another device. Refresh and review again.");
          const stationById = new Map(shift.stationSnapshots?.map((station) => [station.stationId, station]) ?? []);
          for (const [tankId, tankResult] of Object.entries(reconciliation.tanks)) {
            const outflow = Decimal.sum(0, ...Object.entries(reconciliation.nozzles)
              .filter(([stationId]) => (stationById.get(stationId)?.tankId ?? (stationId.startsWith("petrol") ? "petrol_tank" : "diesel_tank")) === tankId)
              .map(([, nozzle]) => nozzle.expectedTankOutflow));
            const tankSnapshot = shift.tankSnapshots?.find((entry) => entry.tankId === tankId);
            const expectedPreCloseStock = new Decimal(shift.openingTankStocks[tankId] ?? "0").plus(input.receipts[tankId] ?? "0").toDecimalPlaces(3).toFixed(3);
            const currentTank = await database.collection<FuelTank>("fuelTanks").findOne({ id: tankId, active: true }, { session });
            if (!currentTank) throw new Error(`Fuel tank not found for station outflow: ${tankId}`);
            if (shift.stationSnapshots?.length && !new Decimal(currentTank.currentStock).equals(expectedPreCloseStock)) {
              throw new Error(`Tank stock changed while closing ${tankSnapshot?.name ?? tankId}. Review the latest receipt and try again.`);
            }
            const tankUpdate = await database.collection<FuelTank>("fuelTanks").updateOne(
              { id: tankId, active: true, currentStock: currentTank.currentStock },
              { $set: { currentStock: tankResult.expectedClosingStock, updatedAt: closed.closedAt! } },
              { session }
            );
            if (tankUpdate.matchedCount !== 1) throw new Error(`Tank stock changed while closing ${tankSnapshot?.name ?? tankId}. Review the latest receipt and try again.`);
            const movement: InventoryMovement = {
              id: crypto.randomUUID(), tankId, productId: tankSnapshot?.productId ?? tankId.replace(/_tank$/, ""),
              type: "SHIFT_DISPENSE", quantity: outflow.negated().toDecimalPlaces(3).toFixed(3),
              balanceAfter: tankResult.expectedClosingStock, referenceId: shift.id,
              referenceLabel: `${shift.name} station dispensing`, businessDate: shift.businessDate,
              createdAt: closed.closedAt!
            };
            await database.collection<InventoryMovement>("inventoryMovements").insertOne(movement, { session });
          }
          await database.collection<IdempotencyRecord>("idempotency").insertOne({ _id: idempotencyId, shiftId: id, createdAt: new Date() }, { session });
          result = closed;
        });
      } finally {
        await session.endSession();
      }

      if (!result) throw new Error("Shift close did not complete");
      return result;
    },

    async updateOpeningReading(id, nozzleId, reading) {
      await ensureIndexes();
      const database = await getMongoDatabase();
      const current = await database.collection<StoredShift>("shifts").findOne({ _id: id });
      if (!current) throw new Error("Shift not found");
      if (current.state === "CLOSED") throw new Error("Closed shifts are immutable in v1");
      const updatedReadings = { ...current.openingNozzleReadings, [nozzleId]: reading };
      const update = await database.collection<StoredShift>("shifts").findOneAndUpdate(
        { _id: id, version: current.version },
        { $set: { openingNozzleReadings: updatedReadings }, $inc: { version: 1 } },
        { returnDocument: "after" }
      );
      if (!update) throw new Error("Shift changed on another device. Refresh and retry.");
      return withoutId(update);
    },

    async updateActiveShift(id, input) {
      await ensureIndexes();
      const client = await getMongoClient(); const database = await getMongoDatabase(); const session = client.startSession(); let result: ShiftRecord | undefined;
      try { await session.withTransaction(async () => {
        const current = await database.collection<StoredShift>("shifts").findOne({ _id: id }, { session });
        if (!current) throw new Error("Shift not found");
        const corrected = applyActiveShiftCorrection(withoutId(current), input);
        const update = await database.collection<StoredShift>("shifts").replaceOne({ _id: id, version: current.version, state: "OPEN" }, { ...corrected }, { session });
        if (update.modifiedCount !== 1) throw new Error("Shift changed on another device. Refresh and retry.");
        for (const [productId, rate] of Object.entries(input.productRates ?? {})) await database.collection("fuelProducts").updateOne({ id: productId, active: true }, { $set: { sellingPricePerLitre: rate.sellingPricePerLitre, costPricePerLitre: rate.costPricePerLitre, marketReferencePrice: rate.sellingPricePerLitre, updatedAt: new Date().toISOString() } }, { session });
        result = corrected;
      }); } finally { await session.endSession(); }
      if (!result) throw new Error("Active-day correction did not complete"); return result;
    },

    async updateActiveShiftPrices(id, input) {
      await ensureIndexes();
      const client = await getMongoClient(); const database = await getMongoDatabase(); const session = client.startSession(); let result: ShiftRecord | undefined;
      try { await session.withTransaction(async () => {
        const current = await database.collection<StoredShift>("shifts").findOne({ _id: id }, { session });
        if (!current) throw new Error("Shift not found");
        const corrected = applyActiveShiftPriceUpdate(withoutId(current), input);
        const update = await database.collection<StoredShift>("shifts").replaceOne({ _id: id, version: current.version, state: "OPEN" }, { ...corrected }, { session });
        if (update.modifiedCount !== 1) throw new Error("Shift changed on another device. Refresh and retry.");
        for (const [productId, rate] of Object.entries(input.productRates)) await database.collection("fuelProducts").updateOne({ id: productId, active: true }, { $set: { sellingPricePerLitre: rate.sellingPricePerLitre, costPricePerLitre: rate.costPricePerLitre, marketReferencePrice: rate.sellingPricePerLitre, updatedAt: new Date().toISOString() } }, { session });
        result = corrected;
      }); } finally { await session.endSession(); }
      if (!result) throw new Error("Active-day price update did not complete"); return result;
    },

    async completePumpShift(id, pumpId, input) {
      await ensureIndexes();
      const client = await getMongoClient(); const database = await getMongoDatabase(); const session = client.startSession(); let result: ShiftRecord | undefined;
      try { await session.withTransaction(async () => {
        const current = await database.collection<StoredShift>("shifts").findOne({ _id: id }, { session });
        if (!current) throw new Error("Shift not found");
        const updated = applyPumpShiftCompletion(withoutId(current), pumpId, input);
        const update = await database.collection<StoredShift>("shifts").replaceOne({ _id: id, version: current.version, state: "OPEN" }, { ...updated }, { session });
        if (update.modifiedCount !== 1) throw new Error("Shift changed on another device. Refresh and retry.");
        result = updated;
      }); } finally { await session.endSession(); }
      if (!result) throw new Error("Pump shift could not be saved");
      return result;
    },

    async correctPumpShiftEntry(id, pumpId, entryId, input) {
      await ensureIndexes();
      const client = await getMongoClient(); const database = await getMongoDatabase(); const session = client.startSession(); let result: ShiftRecord | undefined;
      try { await session.withTransaction(async () => {
        const current = await database.collection<StoredShift>("shifts").findOne({ _id: id }, { session });
        if (!current) throw new Error("Shift not found");
        const updated = applyPumpShiftEntryCorrection(withoutId(current), pumpId, entryId, input);
        const update = await database.collection<StoredShift>("shifts").replaceOne({ _id: id, version: current.version, state: "OPEN" }, { ...updated }, { session });
        if (update.modifiedCount !== 1) throw new Error("Shift changed on another device. Refresh and retry.");
        result = updated;
      }); } finally { await session.endSession(); }
      if (!result) throw new Error("Pump shift correction could not be saved");
      return result;
    },

    async getTankBalances() {
      await getForecourtConfigStore().getConfiguration();
      const tanks = await (await getMongoDatabase()).collection<FuelTank>("fuelTanks").find({ active: true }).toArray();
      return Object.fromEntries(tanks.map((tank) => [tank.id, tank.currentStock]));
    },

    async adjustTankStock(input) {
      await ensureIndexes();
      await getForecourtConfigStore().getConfiguration();
      const client = await getMongoClient();
      const database = await getMongoDatabase();
      const session = client.startSession();
      let movement: InventoryMovement | undefined;
      try {
        await session.withTransaction(async () => {
          const tank = await database.collection<FuelTank>("fuelTanks").findOne({ id: input.tankId, active: true }, { session });
          if (!tank) throw new Error("Fuel tank not found");
          if (!new Decimal(tank.currentStock).equals(input.previousStock)) {
            throw new Error("Tank stock changed on another device. Refresh and try again.");
          }
          const currentStock = new Decimal(input.currentStock).toDecimalPlaces(3).toFixed(3);
          if (new Decimal(currentStock).greaterThan(tank.capacityLitres)) {
            throw new Error(`Stock cannot exceed the ${tank.capacityLitres} litre tank capacity`);
          }
          const createdAt = new Date().toISOString();
          const update = await database.collection<FuelTank>("fuelTanks").updateOne(
            { id: tank.id, active: true, currentStock: tank.currentStock },
            { $set: { currentStock, updatedAt: createdAt } },
            { session }
          );
          if (update.matchedCount !== 1) {
            throw new Error("Tank stock changed on another device. Refresh and try again.");
          }
          movement = {
            id: crypto.randomUUID(),
            tankId: tank.id,
            productId: tank.productId,
            type: "ADJUSTMENT",
            quantity: new Decimal(currentStock).minus(tank.currentStock).toDecimalPlaces(3).toFixed(3),
            balanceAfter: currentStock,
            referenceId: crypto.randomUUID(),
            referenceLabel: `Manual stock adjustment · ${input.reason}`,
            businessDate: input.businessDate,
            createdAt
          };
          await database.collection<InventoryMovement>("inventoryMovements").insertOne(movement, { session });
        });
      } finally {
        await session.endSession();
      }
      if (!movement) throw new Error("Tank stock adjustment did not complete");
      return movement;
    },

    async listInventoryMovements(tankId?: string) {
      await ensureIndexes();
      return (await getMongoDatabase()).collection<InventoryMovement>("inventoryMovements")
        .find(tankId ? { tankId } : {}).sort({ createdAt: -1 }).limit(500).toArray();
    }
  };
}
