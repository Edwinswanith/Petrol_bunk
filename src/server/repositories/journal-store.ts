import type { z } from "zod";

import type { expenseSchema, fuelReceiptSchema } from "@/server/http/schemas";
import { getMongoDatabase, hasMongoConfiguration } from "@/server/db/mongo-client";

type ExpenseInput = z.infer<typeof expenseSchema>;
type FuelReceiptInput = z.infer<typeof fuelReceiptSchema>;

type Stored<T> = T & {
  id: string;
  createdAt: string;
  idempotencyKey: string;
  shiftId?: string;
};

export type ExpenseRecord = Stored<ExpenseInput>;
export type FuelReceiptRecord = Stored<FuelReceiptInput>;

declare global {
  var forecourtExpenses: ExpenseRecord[] | undefined;
  var forecourtFuelReceipts: FuelReceiptRecord[] | undefined;
}

let journalIndexesReady: Promise<void> | undefined;

async function ensureJournalIndexes() {
  if (!journalIndexesReady) {
    journalIndexesReady = getMongoDatabase().then(async (database) => {
      await Promise.all([
        database.collection<ExpenseRecord>("expenses").createIndex({ idempotencyKey: 1 }, { unique: true }),
        database.collection<ExpenseRecord>("expenses").createIndex({ date: -1, createdAt: -1 }),
        database.collection<FuelReceiptRecord>("fuelReceipts").createIndex({ idempotencyKey: 1 }, { unique: true }),
        database.collection<FuelReceiptRecord>("fuelReceipts").createIndex({ shiftId: 1, createdAt: -1 })
      ]);
    });
  }
  return journalIndexesReady;
}

export async function saveExpense(input: ExpenseInput, idempotencyKey: string, shiftId?: string) {
  if (hasMongoConfiguration()) {
    await ensureJournalIndexes();
    const database = await getMongoDatabase();
    const collection = database.collection<ExpenseRecord>("expenses");
    const existing = await collection.findOne({ idempotencyKey });
    if (existing) return existing;
    const record: ExpenseRecord = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), idempotencyKey, shiftId };
    const saved = await collection.findOneAndUpdate(
      { idempotencyKey },
      { $setOnInsert: record },
      { upsert: true, returnDocument: "after" }
    );
    if (!saved) throw new Error("Expense could not be saved");
    return saved;
  }
  globalThis.forecourtExpenses ??= [];
  const existing = globalThis.forecourtExpenses.find((expense) => expense.idempotencyKey === idempotencyKey);
  if (existing) return existing;
  const record: ExpenseRecord = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), idempotencyKey, shiftId };
  globalThis.forecourtExpenses.unshift(record);
  return record;
}

export async function listExpenses() {
  if (hasMongoConfiguration()) {
    await ensureJournalIndexes();
    return getMongoDatabase().then((database) => database.collection<ExpenseRecord>("expenses").find().sort({ createdAt: -1 }).limit(200).toArray());
  }
  return globalThis.forecourtExpenses ?? [];
}

export async function saveFuelReceipt(input: FuelReceiptInput, idempotencyKey: string, shiftId?: string) {
  if (hasMongoConfiguration()) {
    await ensureJournalIndexes();
    const database = await getMongoDatabase();
    const collection = database.collection<FuelReceiptRecord>("fuelReceipts");
    const existing = await collection.findOne({ idempotencyKey });
    if (existing) return existing;
    const record: FuelReceiptRecord = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), idempotencyKey, shiftId };
    const saved = await collection.findOneAndUpdate(
      { idempotencyKey },
      { $setOnInsert: record },
      { upsert: true, returnDocument: "after" }
    );
    if (!saved) throw new Error("Fuel receipt could not be saved");
    return saved;
  }
  globalThis.forecourtFuelReceipts ??= [];
  const existing = globalThis.forecourtFuelReceipts.find((receipt) => receipt.idempotencyKey === idempotencyKey);
  if (existing) return existing;
  const record: FuelReceiptRecord = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), idempotencyKey, shiftId };
  globalThis.forecourtFuelReceipts.unshift(record);
  return record;
}

export async function listFuelReceipts() {
  if (hasMongoConfiguration()) {
    await ensureJournalIndexes();
    return getMongoDatabase().then((database) => database.collection<FuelReceiptRecord>("fuelReceipts").find().sort({ createdAt: -1 }).limit(200).toArray());
  }
  return globalThis.forecourtFuelReceipts ?? [];
}
