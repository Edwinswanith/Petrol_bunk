import { MongoServerError } from "mongodb";

import { getMongoDatabase, hasMongoConfiguration } from "@/server/db/mongo-client";
import type { ForecourtConfiguration, FuelProduct, FuelStation, FuelTank } from "@/server/domain/forecourt";

type CreateProductInput = Pick<FuelProduct, "code" | "name" | "sellingPricePerLitre" | "costPricePerLitre"> & Partial<Pick<FuelProduct, "marketReferencePrice">>;
type CreateTankInput = Pick<FuelTank, "code" | "name" | "productId" | "capacityLitres" | "currentStock">;
type CreateStationInput = Pick<FuelStation, "code" | "name" | "productId" | "tankId" | "totalizerPrecision"> & Partial<Pick<FuelStation, "dispenserId" | "dispenserCode" | "sideId" | "sideLabel" | "nozzleNumber" | "displayOrder">>;
type UpdatePriceInput = Pick<FuelProduct, "sellingPricePerLitre" | "costPricePerLitre"> & Partial<Pick<FuelProduct, "marketReferencePrice">>;

export interface ForecourtConfigStore {
  getConfiguration(): Promise<ForecourtConfiguration>;
  createProduct(input: CreateProductInput): Promise<FuelProduct>;
  updateProductPrice(id: string, input: UpdatePriceInput): Promise<FuelProduct>;
  createTank(input: CreateTankInput): Promise<FuelTank>;
  createStation(input: CreateStationInput): Promise<FuelStation>;
  setTankStock(tankId: string, currentStock: string): Promise<void>;
}

const defaultProducts: FuelProduct[] = [
  { id: "petrol", code: "PETROL", name: "Petrol", sellingPricePerLitre: "102.50", costPricePerLitre: "96.80", marketReferencePrice: "102.50", active: true, createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z" },
  { id: "diesel", code: "DIESEL", name: "Diesel", sellingPricePerLitre: "100.50", costPricePerLitre: "94.40", marketReferencePrice: "100.50", active: true, createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z" }
];
const defaultTanks: FuelTank[] = [
  { id: "petrol_tank", code: "PT1", name: "Petrol Tank 1", productId: "petrol", capacityLitres: "20000", currentStock: "12460", active: true, createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z" },
  { id: "diesel_tank", code: "DT1", name: "Diesel Tank 1", productId: "diesel", capacityLitres: "20000", currentStock: "9002.985", active: true, createdAt: "2026-08-31T00:00:00.000Z", updatedAt: "2026-08-31T00:00:00.000Z" }
];
const layoutDate = "2026-09-01T00:00:00.000Z";
const defaultStations: FuelStation[] = [
  ["a_n1", "A-N1", 1, "pump-a", "A", "A-S1", "Side 1", "petrol", "petrol_tank"],
  ["a_n2", "A-N2", 2, "pump-a", "A", "A-S2", "Side 2", "petrol", "petrol_tank"],
  ["a_n3", "A-N3", 3, "pump-a", "A", "A-S1", "Side 1", "diesel", "diesel_tank"],
  ["a_n4", "A-N4", 4, "pump-a", "A", "A-S2", "Side 2", "diesel", "diesel_tank"],
  ["b_n1", "B-N1", 1, "pump-b", "B", "B-S1", "Side 1", "petrol", "petrol_tank"],
  ["b_n2", "B-N2", 2, "pump-b", "B", "B-S2", "Side 2", "petrol", "petrol_tank"],
  ["b_n3", "B-N3", 3, "pump-b", "B", "B-S1", "Side 1", "diesel", "diesel_tank"],
  ["b_n4", "B-N4", 4, "pump-b", "B", "B-S2", "Side 2", "diesel", "diesel_tank"]
].map(([id, code, nozzleNumber, dispenserId, dispenserCode, sideId, sideLabel, productId, tankId], displayOrder) => ({
  id: String(id), code: String(code), name: `Pump ${dispenserCode} nozzle ${nozzleNumber}`,
  productId: String(productId), tankId: String(tankId), totalizerPrecision: 3,
  dispenserId: String(dispenserId), dispenserCode: String(dispenserCode), sideId: String(sideId), sideLabel: String(sideLabel),
  nozzleNumber: Number(nozzleNumber), displayOrder: displayOrder + 1, active: true, createdAt: layoutDate, updatedAt: layoutDate
}));

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
        database.collection<FuelStation>("fuelStations").updateMany({ id: { $in: ["petrol_1", "diesel_1"] } }, { $set: { active: false, updatedAt: layoutDate } }),
        ...defaultStations.map((item) => database.collection<FuelStation>("fuelStations").updateOne({ id: item.id }, { $setOnInsert: item }, { upsert: true }))
      ]);
      const xpPattern = /^(XP\s?(95|100)|X\s?(95|100))/i;
      const xpProducts = await database.collection<FuelProduct>("fuelProducts").find({ $or: [{ code: xpPattern }, { name: xpPattern }] }).project<{ id: string }>({ id: 1, _id: 0 }).toArray();
      const xpProductIds = xpProducts.map((product) => product.id);
      if (xpProductIds.length) {
        const now = new Date().toISOString();
        const xpTanks = await database.collection<FuelTank>("fuelTanks").find({ productId: { $in: xpProductIds } }).project<{ id: string }>({ id: 1, _id: 0 }).toArray();
        await Promise.all([
          database.collection<FuelProduct>("fuelProducts").updateMany({ id: { $in: xpProductIds } }, { $set: { active: false, updatedAt: now } }),
          database.collection<FuelTank>("fuelTanks").updateMany({ productId: { $in: xpProductIds } }, { $set: { active: false, updatedAt: now } }),
          database.collection<FuelStation>("fuelStations").updateMany({ $or: [{ productId: { $in: xpProductIds } }, { tankId: { $in: xpTanks.map((tank) => tank.id) } }] }, { $set: { active: false, updatedAt: now } })
        ]);
      }
      await database.collection<FuelStation>("fuelStations").deleteMany({ code: { $in: ["XD", "XM"] } });
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
        database.collection<FuelStation>("fuelStations").find({}, { projection: { _id: 0 } }).sort({ displayOrder: 1, code: 1 }).toArray()
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
