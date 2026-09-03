import type { z } from "zod";
import { MongoServerError } from "mongodb";

import type { expenseSchema, fuelReceiptSchema, fuelReceiptUpdateSchema } from "@/server/http/schemas";
import { getMongoDatabase, hasMongoConfiguration } from "@/server/db/mongo-client";
import { getMongoClient } from "@/server/db/mongo-client";
import Decimal from "decimal.js";
import type { FuelTank, InventoryMovement } from "@/server/domain/forecourt";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

type ExpenseInput = z.infer<typeof expenseSchema>;
type FuelReceiptInput = z.infer<typeof fuelReceiptSchema>;
type FuelReceiptUpdateInput = z.infer<typeof fuelReceiptUpdateSchema>;

type Stored<T> = T & {
  id: string;
  createdAt: string;
  idempotencyKey: string;
  shiftId?: string;
};

export type ExpenseRecord = Stored<ExpenseInput>;
export type FuelReceiptRecord = Stored<FuelReceiptInput> & {
  updatedAt?: string;
  correctionReason?: string;
  voided?: boolean;
  voidedAt?: string;
  voidReason?: string;
};

declare global {
  var forecourtExpenses: ExpenseRecord[] | undefined;
  var forecourtFuelReceipts: FuelReceiptRecord[] | undefined;
  var forecourtReceiptInventoryMovements: InventoryMovement[] | undefined;
}

let journalIndexesReady: Promise<void> | undefined;

async function ensureJournalIndexes() {
  if (!journalIndexesReady) {
    journalIndexesReady = getMongoDatabase().then(async (database) => {
      await Promise.all([
        database.collection<ExpenseRecord>("expenses").createIndex({ idempotencyKey: 1 }, { unique: true }),
        database.collection<ExpenseRecord>("expenses").createIndex({ date: -1, createdAt: -1 }),
        database.collection<FuelReceiptRecord>("fuelReceipts").createIndex({ idempotencyKey: 1 }, { unique: true }),
        database.collection<FuelReceiptRecord>("fuelReceipts").createIndex({ shiftId: 1, createdAt: -1 }),
        database.collection<InventoryMovement>("inventoryMovements").createIndex({ referenceId: 1, tankId: 1, type: 1 }, { unique: true })
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
    await getForecourtConfigStore().getConfiguration();
    const client = await getMongoClient();
    const database = await getMongoDatabase();
    const collection = database.collection<FuelReceiptRecord>("fuelReceipts");
    const session = client.startSession();
    let result: FuelReceiptRecord | undefined;
    try {
      await session.withTransaction(async () => {
        const existing = await collection.findOne({ idempotencyKey }, { session });
        if (existing) { result = existing; return; }
        const tank = await database.collection<FuelTank>("fuelTanks").findOne({ id: input.tankId, active: true }, { session });
        if (!tank) throw new Error("Fuel tank not found");
        if (tank.productId !== input.product) throw new Error("Receipt product must match the selected tank");
        const record: FuelReceiptRecord = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), idempotencyKey, shiftId };
        const balanceAfter = new Decimal(tank.currentStock).plus(input.acceptedQuantity).toDecimalPlaces(3).toFixed(3);
        await collection.insertOne(record, { session });
        await database.collection<FuelTank>("fuelTanks").updateOne({ id: tank.id }, { $set: { currentStock: balanceAfter, updatedAt: record.createdAt } }, { session });
        await database.collection<InventoryMovement>("inventoryMovements").insertOne({
          id: crypto.randomUUID(), tankId: tank.id, productId: tank.productId, type: "FUEL_RECEIPT",
          quantity: new Decimal(input.acceptedQuantity).toDecimalPlaces(3).toFixed(3), balanceAfter,
          referenceId: record.id, referenceLabel: `Fuel receipt ${input.invoiceNumber}`,
          businessDate: record.createdAt.slice(0, 10), createdAt: record.createdAt
        }, { session });
        result = record;
      });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        result = await collection.findOne({ idempotencyKey }) ?? undefined;
      } else {
        throw error;
      }
    } finally { await session.endSession(); }
    if (!result) throw new Error("Fuel receipt could not be saved");
    return result;
  }
  globalThis.forecourtFuelReceipts ??= [];
  const existing = globalThis.forecourtFuelReceipts.find((receipt) => receipt.idempotencyKey === idempotencyKey);
  if (existing) return existing;
  const record: FuelReceiptRecord = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), idempotencyKey, shiftId };
  const configStore = getForecourtConfigStore();
  const configuration = await configStore.getConfiguration();
  const tank = configuration.tanks.find((item) => item.id === input.tankId && item.active);
  if (!tank) throw new Error("Fuel tank not found");
  if (tank.productId !== input.product) throw new Error("Receipt product must match the selected tank");
  const balanceAfter = new Decimal(tank.currentStock).plus(input.acceptedQuantity).toDecimalPlaces(3).toFixed(3);
  await configStore.setTankStock(tank.id, balanceAfter);
  globalThis.forecourtReceiptInventoryMovements ??= [];
  globalThis.forecourtReceiptInventoryMovements.unshift({
    id: crypto.randomUUID(), tankId: tank.id, productId: tank.productId, type: "FUEL_RECEIPT",
    quantity: new Decimal(input.acceptedQuantity).toDecimalPlaces(3).toFixed(3), balanceAfter,
    referenceId: record.id, referenceLabel: `Fuel receipt ${input.invoiceNumber}`,
    businessDate: record.createdAt.slice(0, 10), createdAt: record.createdAt
  });
  globalThis.forecourtFuelReceipts.unshift(record);
  return record;
}

export async function listFuelReceipts(options: { includeVoided?: boolean } = {}) {
  if (hasMongoConfiguration()) {
    await ensureJournalIndexes();
    const filter = options.includeVoided ? {} : { voided: { $ne: true } };
    return getMongoDatabase().then((database) => database.collection<FuelReceiptRecord>("fuelReceipts").find(filter).sort({ createdAt: -1 }).limit(200).toArray());
  }
  const all = globalThis.forecourtFuelReceipts ?? [];
  return options.includeVoided ? all : all.filter((receipt) => !receipt.voided);
}

export async function updateFuelReceipt(id: string, input: FuelReceiptUpdateInput) {
  const { reason, ...fields } = input;
  if (hasMongoConfiguration()) {
    await ensureJournalIndexes();
    const client = await getMongoClient();
    const database = await getMongoDatabase();
    const collection = database.collection<FuelReceiptRecord>("fuelReceipts");
    const session = client.startSession();
    let result: { receipt: FuelReceiptRecord; movement: InventoryMovement } | undefined;
    try {
      await session.withTransaction(async () => {
        const receipt = await collection.findOne({ id }, { session });
        if (!receipt) throw new Error("Fuel receipt not found");
        if (receipt.voided) throw new Error("Fuel receipt has already been voided");
        const tank = await database.collection<FuelTank>("fuelTanks").findOne({ id: receipt.tankId, active: true }, { session });
        if (!tank) throw new Error("Fuel tank not found");
        const delta = new Decimal(fields.acceptedQuantity).minus(receipt.acceptedQuantity);
        const balanceAfter = new Decimal(tank.currentStock).plus(delta).toDecimalPlaces(3).toFixed(3);
        if (new Decimal(balanceAfter).lessThan(0)) throw new Error("Correction would take the tank stock below zero");
        if (new Decimal(balanceAfter).greaterThan(tank.capacityLitres)) throw new Error(`Stock cannot exceed the ${tank.capacityLitres} litre tank capacity`);
        const updatedAt = new Date().toISOString();
        const receiptUpdate = await collection.updateOne(
          { id, voided: { $ne: true } },
          { $set: { ...fields, updatedAt, correctionReason: reason } },
          { session }
        );
        if (receiptUpdate.matchedCount !== 1) throw new Error("Fuel receipt has already been voided");
        const tankUpdate = await database.collection<FuelTank>("fuelTanks").updateOne(
          { id: tank.id, active: true, currentStock: tank.currentStock },
          { $set: { currentStock: balanceAfter, updatedAt } },
          { session }
        );
        if (tankUpdate.matchedCount !== 1) throw new Error("Tank stock changed on another device. Refresh and try again.");
        const movement: InventoryMovement = {
          id: crypto.randomUUID(), tankId: tank.id, productId: tank.productId, type: "ADJUSTMENT",
          quantity: delta.toDecimalPlaces(3).toFixed(3), balanceAfter,
          referenceId: crypto.randomUUID(), referenceLabel: `Fuel receipt ${receipt.invoiceNumber} corrected · ${reason}`,
          businessDate: updatedAt.slice(0, 10), createdAt: updatedAt
        };
        await database.collection<InventoryMovement>("inventoryMovements").insertOne(movement, { session });
        const updated = await collection.findOne({ id }, { session });
        result = { receipt: updated!, movement };
      });
    } finally { await session.endSession(); }
    if (!result) throw new Error("Fuel receipt could not be updated");
    return result;
  }
  globalThis.forecourtFuelReceipts ??= [];
  const receipt = globalThis.forecourtFuelReceipts.find((item) => item.id === id);
  if (!receipt) throw new Error("Fuel receipt not found");
  if (receipt.voided) throw new Error("Fuel receipt has already been voided");
  const configStore = getForecourtConfigStore();
  const configuration = await configStore.getConfiguration();
  const tank = configuration.tanks.find((item) => item.id === receipt.tankId && item.active);
  if (!tank) throw new Error("Fuel tank not found");
  const delta = new Decimal(fields.acceptedQuantity).minus(receipt.acceptedQuantity);
  const balanceAfter = new Decimal(tank.currentStock).plus(delta).toDecimalPlaces(3).toFixed(3);
  if (new Decimal(balanceAfter).lessThan(0)) throw new Error("Correction would take the tank stock below zero");
  if (new Decimal(balanceAfter).greaterThan(tank.capacityLitres)) throw new Error(`Stock cannot exceed the ${tank.capacityLitres} litre tank capacity`);
  const updatedAt = new Date().toISOString();
  Object.assign(receipt, fields, { updatedAt, correctionReason: reason });
  await configStore.setTankStock(tank.id, balanceAfter);
  const movement: InventoryMovement = {
    id: crypto.randomUUID(), tankId: tank.id, productId: tank.productId, type: "ADJUSTMENT",
    quantity: delta.toDecimalPlaces(3).toFixed(3), balanceAfter,
    referenceId: crypto.randomUUID(), referenceLabel: `Fuel receipt ${receipt.invoiceNumber} corrected · ${reason}`,
    businessDate: updatedAt.slice(0, 10), createdAt: updatedAt
  };
  globalThis.forecourtReceiptInventoryMovements ??= [];
  globalThis.forecourtReceiptInventoryMovements.unshift(movement);
  return { receipt, movement };
}

export async function voidFuelReceipt(id: string, reason: string) {
  if (hasMongoConfiguration()) {
    await ensureJournalIndexes();
    const client = await getMongoClient();
    const database = await getMongoDatabase();
    const collection = database.collection<FuelReceiptRecord>("fuelReceipts");
    const session = client.startSession();
    let result: { receipt: FuelReceiptRecord; movement: InventoryMovement } | undefined;
    try {
      await session.withTransaction(async () => {
        const receipt = await collection.findOne({ id }, { session });
        if (!receipt) throw new Error("Fuel receipt not found");
        if (receipt.voided) throw new Error("Fuel receipt has already been voided");
        const tank = await database.collection<FuelTank>("fuelTanks").findOne({ id: receipt.tankId, active: true }, { session });
        if (!tank) throw new Error("Fuel tank not found");
        const delta = new Decimal(receipt.acceptedQuantity).negated();
        const balanceAfter = new Decimal(tank.currentStock).plus(delta).toDecimalPlaces(3).toFixed(3);
        if (new Decimal(balanceAfter).lessThan(0)) throw new Error("Voiding this receipt would take the tank stock below zero");
        const voidedAt = new Date().toISOString();
        const receiptUpdate = await collection.updateOne(
          { id, voided: { $ne: true } },
          { $set: { voided: true, voidedAt, voidReason: reason, updatedAt: voidedAt } },
          { session }
        );
        if (receiptUpdate.matchedCount !== 1) throw new Error("Fuel receipt has already been voided");
        const tankUpdate = await database.collection<FuelTank>("fuelTanks").updateOne(
          { id: tank.id, active: true, currentStock: tank.currentStock },
          { $set: { currentStock: balanceAfter, updatedAt: voidedAt } },
          { session }
        );
        if (tankUpdate.matchedCount !== 1) throw new Error("Tank stock changed on another device. Refresh and try again.");
        const movement: InventoryMovement = {
          id: crypto.randomUUID(), tankId: tank.id, productId: tank.productId, type: "ADJUSTMENT",
          quantity: delta.toDecimalPlaces(3).toFixed(3), balanceAfter,
          referenceId: crypto.randomUUID(), referenceLabel: `Fuel receipt ${receipt.invoiceNumber} voided · ${reason}`,
          businessDate: voidedAt.slice(0, 10), createdAt: voidedAt
        };
        await database.collection<InventoryMovement>("inventoryMovements").insertOne(movement, { session });
        const updated = await collection.findOne({ id }, { session });
        result = { receipt: updated!, movement };
      });
    } finally { await session.endSession(); }
    if (!result) throw new Error("Fuel receipt could not be voided");
    return result;
  }
  globalThis.forecourtFuelReceipts ??= [];
  const receipt = globalThis.forecourtFuelReceipts.find((item) => item.id === id);
  if (!receipt) throw new Error("Fuel receipt not found");
  if (receipt.voided) throw new Error("Fuel receipt has already been voided");
  const configStore = getForecourtConfigStore();
  const configuration = await configStore.getConfiguration();
  const tank = configuration.tanks.find((item) => item.id === receipt.tankId && item.active);
  if (!tank) throw new Error("Fuel tank not found");
  const delta = new Decimal(receipt.acceptedQuantity).negated();
  const balanceAfter = new Decimal(tank.currentStock).plus(delta).toDecimalPlaces(3).toFixed(3);
  if (new Decimal(balanceAfter).lessThan(0)) throw new Error("Voiding this receipt would take the tank stock below zero");
  const voidedAt = new Date().toISOString();
  Object.assign(receipt, { voided: true, voidedAt, voidReason: reason, updatedAt: voidedAt });
  await configStore.setTankStock(tank.id, balanceAfter);
  const movement: InventoryMovement = {
    id: crypto.randomUUID(), tankId: tank.id, productId: tank.productId, type: "ADJUSTMENT",
    quantity: delta.toDecimalPlaces(3).toFixed(3), balanceAfter,
    referenceId: crypto.randomUUID(), referenceLabel: `Fuel receipt ${receipt.invoiceNumber} voided · ${reason}`,
    businessDate: voidedAt.slice(0, 10), createdAt: voidedAt
  };
  globalThis.forecourtReceiptInventoryMovements ??= [];
  globalThis.forecourtReceiptInventoryMovements.unshift(movement);
  return { receipt, movement };
}
