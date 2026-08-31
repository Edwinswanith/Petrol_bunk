import type { z } from "zod";

import { getMongoDatabase, hasMongoConfiguration } from "@/server/db/mongo-client";
import type { densityCheckSchema } from "@/server/http/schemas";

type DensityCheckInput = z.infer<typeof densityCheckSchema>;

export type DensityCheckRecord = DensityCheckInput & {
  id: string;
  createdAt: string;
  idempotencyKey: string;
};

declare global {
  var forecourtDensityChecks: DensityCheckRecord[] | undefined;
}

let indexesReady: Promise<void> | undefined;

async function ensureIndexes() {
  if (!indexesReady) {
    indexesReady = getMongoDatabase().then(async (database) => {
      await Promise.all([
        database.collection<DensityCheckRecord>("densityChecks").createIndex({ idempotencyKey: 1 }, { unique: true }),
        database.collection<DensityCheckRecord>("densityChecks").createIndex({ date: -1, createdAt: -1 })
      ]);
    });
  }
  return indexesReady;
}

export async function saveDensityCheck(input: DensityCheckInput, idempotencyKey: string) {
  if (hasMongoConfiguration()) {
    await ensureIndexes();
    const collection = (await getMongoDatabase()).collection<DensityCheckRecord>("densityChecks");
    const record: DensityCheckRecord = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      idempotencyKey
    };
    const saved = await collection.findOneAndUpdate(
      { idempotencyKey },
      { $setOnInsert: record },
      { upsert: true, returnDocument: "after" }
    );
    if (!saved) throw new Error("Quality check could not be saved");
    return saved;
  }

  globalThis.forecourtDensityChecks ??= [];
  const existing = globalThis.forecourtDensityChecks.find(
    (check) => check.idempotencyKey === idempotencyKey
  );
  if (existing) return existing;
  const record: DensityCheckRecord = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    idempotencyKey
  };
  globalThis.forecourtDensityChecks.unshift(record);
  return record;
}

export async function listDensityChecks() {
  if (hasMongoConfiguration()) {
    await ensureIndexes();
    return getMongoDatabase().then((database) =>
      database.collection<DensityCheckRecord>("densityChecks").find().sort({ createdAt: -1 }).limit(200).toArray()
    );
  }
  return globalThis.forecourtDensityChecks ?? [];
}
