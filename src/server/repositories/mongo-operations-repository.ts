import { MongoServerError } from "mongodb";

import { getMongoClient, getMongoDatabase } from "@/server/db/mongo-client";
import type { ShiftRecord } from "@/server/domain/operations";
import type { OperationsRepository } from "@/server/repositories/operations-repository";
import { reconcileShift } from "@/server/services/shift-reconciliation-service";

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
        database.collection<IdempotencyRecord>("idempotency").createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 })
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
    }
  };
}
