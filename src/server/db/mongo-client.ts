import { Db, MongoClient } from "mongodb";

declare global {
  var forecourtMongoClientPromise: Promise<MongoClient> | undefined;
}

export function hasMongoConfiguration() {
  return Boolean(process.env.MONGODB_URI);
}

export async function getMongoDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");

  if (!globalThis.forecourtMongoClientPromise) {
    const client = new MongoClient(uri, {
      appName: "forecourt-owner-os",
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5000
    });
    globalThis.forecourtMongoClientPromise = client.connect();
  }

  const client = await globalThis.forecourtMongoClientPromise;
  return client.db(process.env.MONGODB_DB ?? "forecourt");
}

export async function getMongoClient(): Promise<MongoClient> {
  await getMongoDatabase();
  return globalThis.forecourtMongoClientPromise!;
}
