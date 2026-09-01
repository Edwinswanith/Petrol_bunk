import { MongoServerError } from "mongodb";

import { getMongoDatabase, hasMongoConfiguration } from "@/server/db/mongo-client";
import type { ForecourtConfiguration, FuelProduct, FuelStation, FuelTank } from "@/server/domain/forecourt";

type CreateProductInput = Pick<FuelProduct, "code" | "name" | "sellingPricePerLitre" | "costPricePerLitre">;
type CreateTankInput = Pick<FuelTank, "code" | "name" | "productId" | "capacityLitres" | "currentStock">;
type CreateStationInput = Pick<FuelStation, "code" | "name" | "productId" | "tankId" | "totalizerPrecision">;
type UpdatePriceInput = Pick<FuelProduct, "sellingPricePerLitre" | "costPricePerLitre">;

export interface ForecourtConfigStore {
  getConfiguration(): Promise<ForecourtConfiguration>;
  createProduct(input: CreateProductInput): Promise<FuelProduct>;
  updateProductPrice(id: string, input: UpdatePriceInput): Promise<FuelProduct>;
  createTank(input: CreateTankInput): Promise<FuelTank>;
  createStation(input: CreateStationInput): Promise<FuelStation>;
  setTankStock(tankId: string, currentStock: string): Promise<void>;
}

const defaultProducts: FuelProduct[] = [
  { id: "petrol", code: "PETROL", name: "Petrol", sellingPricePerLitre: "102.50", costPricePerLitre: "96.80", active: true, createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z" },
  { id: "diesel", code: "DIESEL", name: "Diesel", sellingPricePerLitre: "100.50", costPricePerLitre: "94.40", active: true, createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z" }
];
const defaultTanks: FuelTank[] = [
  { id: "petrol_tank", code: "PT1", name: "Petrol Tank 1", productId: "petrol", capacityLitres: "20000", currentStock: "12460", active: true, createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z" },
  { id: "diesel_tank", code: "DT1", name: "Diesel Tank 1", productId: "diesel", capacityLitres: "20000", currentStock: "9002.985", active: true, createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z" }
];
const defaultStations: FuelStation[] = [
  { id: "petrol_1", code: "P1", name: "Petrol station P1", productId: "petrol", tankId: "petrol_tank", totalizerPrecision: 3, active: true, createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z" },
  { id: "diesel_1", code: "D1", name: "Diesel station D1", productId: "diesel", tankId: "diesel_tank", totalizerPrecision: 3, active: true, createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z" }
];

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createMemoryForecourtConfigStore(options: { seedDefaults: boolean }): ForecourtConfigStore {
  const products = new Map((options.seedDefaults ? defaultProducts : []).map((item) => [item.id, clone(item)]));
  const tanks = new Map((options.seedDefaults ? defaultTanks : []).map((item) => [item.id, clone(item)]));
  const stations = new Map((options.seedDefaults ? defaultStations : []).map((item) => [item.id, clone(item)]));

  return {
    async getConfiguration() {
      return { products: clone([...products.values()]), tanks: clone([...tanks.values()]), stations: clone([...stations.values()]) };
    },
    async createProduct(input) {
      const code = normalizeCode(input.code);
      if ([...products.values()].some((item) => item.code === code)) throw new Error("Product code already exists");
      const now = new Date().toISOString();
      const product: FuelProduct = { ...clone(input), code, id: crypto.randomUUID(), active: true, createdAt: now, updatedAt: now };
      products.set(product.id, product);
      return clone(product);
    },
    async updateProductPrice(id, input) {
      const product = products.get(id);
      if (!product) throw new Error("Fuel product not found");
      const updated = { ...product, ...clone(input), updatedAt: new Date().toISOString() };
      products.set(id, updated);
      return clone(updated);
    },
    async createTank(input) {
      const code = normalizeCode(input.code);
      if (!products.has(input.productId)) throw new Error("Fuel product not found");
      if ([...tanks.values()].some((item) => item.code === code)) throw new Error("Tank code already exists");
      const now = new Date().toISOString();
      const tank: FuelTank = { ...clone(input), code, id: crypto.randomUUID(), active: true, createdAt: now, updatedAt: now };
      tanks.set(tank.id, tank);
      return clone(tank);
    },
    async createStation(input) {
      const code = normalizeCode(input.code);
      const tank = tanks.get(input.tankId);
      if (!products.has(input.productId)) throw new Error("Fuel product not found");
      if (!tank) throw new Error("Fuel tank not found");
      if (tank.productId !== input.productId) throw new Error("Station product must match the selected tank");
      if ([...stations.values()].some((item) => item.code === code)) throw new Error("Station code already exists");
      const now = new Date().toISOString();
      const station: FuelStation = { ...clone(input), code, id: crypto.randomUUID(), active: true, createdAt: now, updatedAt: now };
      stations.set(station.id, station);
      return clone(station);
    },
    async setTankStock(tankId, currentStock) {
      const tank = tanks.get(tankId);
      if (!tank) throw new Error("Fuel tank not found");
      tanks.set(tankId, { ...tank, currentStock, updatedAt: new Date().toISOString() });
    }
  };
}

let mongoConfigIndexes: Promise<void> | undefined;
async function ensureMongoConfig() {
  if (!mongoConfigIndexes) {
    mongoConfigIndexes = (async () => {
      const database = await getMongoDatabase();
      await Promise.all([
        database.collection<FuelProduct>("fuelProducts").createIndex({ code: 1 }, { unique: true }),
        database.collection<FuelTank>("fuelTanks").createIndex({ code: 1 }, { unique: true }),
        database.collection<FuelStation>("fuelStations").createIndex({ code: 1 }, { unique: true }),
        ...defaultProducts.map((item) => database.collection<FuelProduct>("fuelProducts").updateOne({ id: item.id }, { $setOnInsert: item }, { upsert: true })),
        ...defaultTanks.map((item) => database.collection<FuelTank>("fuelTanks").updateOne({ id: item.id }, { $setOnInsert: item }, { upsert: true })),
        ...defaultStations.map((item) => database.collection<FuelStation>("fuelStations").updateOne({ id: item.id }, { $setOnInsert: item }, { upsert: true }))
      ]);
    })();
  }
  return mongoConfigIndexes;
}

function createMongoForecourtConfigStore(): ForecourtConfigStore {
  return {
    async getConfiguration() {
      await ensureMongoConfig();
      const database = await getMongoDatabase();
      const [products, tanks, stations] = await Promise.all([
        database.collection<FuelProduct>("fuelProducts").find({}, { projection: { _id: 0 } }).sort({ name: 1 }).toArray(),
        database.collection<FuelTank>("fuelTanks").find({}, { projection: { _id: 0 } }).sort({ name: 1 }).toArray(),
        database.collection<FuelStation>("fuelStations").find({}, { projection: { _id: 0 } }).sort({ code: 1 }).toArray()
      ]);
      return { products, tanks, stations };
    },
    async createProduct(input) {
      await ensureMongoConfig();
      const now = new Date().toISOString();
      const product: FuelProduct = { ...input, code: normalizeCode(input.code), id: crypto.randomUUID(), active: true, createdAt: now, updatedAt: now };
      try { await (await getMongoDatabase()).collection<FuelProduct>("fuelProducts").insertOne(product); }
      catch (error) { if (error instanceof MongoServerError && error.code === 11000) throw new Error("Product code already exists"); throw error; }
      return product;
    },
    async updateProductPrice(id, input) {
      await ensureMongoConfig();
      const updatedAt = new Date().toISOString();
      const product = await (await getMongoDatabase()).collection<FuelProduct>("fuelProducts").findOneAndUpdate({ id, active: true }, { $set: { ...input, updatedAt } }, { returnDocument: "after", projection: { _id: 0 } });
      if (!product) throw new Error("Fuel product not found");
      return product;
    },
    async createTank(input) {
      await ensureMongoConfig();
      const database = await getMongoDatabase();
      if (!await database.collection<FuelProduct>("fuelProducts").findOne({ id: input.productId })) throw new Error("Fuel product not found");
      const now = new Date().toISOString();
      const tank: FuelTank = { ...input, code: normalizeCode(input.code), id: crypto.randomUUID(), active: true, createdAt: now, updatedAt: now };
      try { await database.collection<FuelTank>("fuelTanks").insertOne(tank); }
      catch (error) { if (error instanceof MongoServerError && error.code === 11000) throw new Error("Tank code already exists"); throw error; }
      return tank;
    },
    async createStation(input) {
      await ensureMongoConfig();
      const database = await getMongoDatabase();
      const tank = await database.collection<FuelTank>("fuelTanks").findOne({ id: input.tankId });
      if (!tank) throw new Error("Fuel tank not found");
      if (tank.productId !== input.productId) throw new Error("Station product must match the selected tank");
      const now = new Date().toISOString();
      const station: FuelStation = { ...input, code: normalizeCode(input.code), id: crypto.randomUUID(), active: true, createdAt: now, updatedAt: now };
      try { await database.collection<FuelStation>("fuelStations").insertOne(station); }
      catch (error) { if (error instanceof MongoServerError && error.code === 11000) throw new Error("Station code already exists"); throw error; }
      return station;
    },
    async setTankStock(tankId, currentStock) {
      await ensureMongoConfig();
      const update = await (await getMongoDatabase()).collection<FuelTank>("fuelTanks").updateOne({ id: tankId }, { $set: { currentStock, updatedAt: new Date().toISOString() } });
      if (update.matchedCount !== 1) throw new Error("Fuel tank not found");
    }
  };
}

declare global { var forecourtConfigStore: ForecourtConfigStore | undefined; }
export function getForecourtConfigStore(): ForecourtConfigStore {
  globalThis.forecourtConfigStore ??= hasMongoConfiguration() ? createMongoForecourtConfigStore() : createMemoryForecourtConfigStore({ seedDefaults: true });
  return globalThis.forecourtConfigStore;
}
