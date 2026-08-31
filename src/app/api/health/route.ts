import { getMongoDatabase, hasMongoConfiguration } from "@/server/db/mongo-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const storage = hasMongoConfiguration() ? "mongodb" : "memory-demo";
  try {
    if (hasMongoConfiguration()) {
      await (await getMongoDatabase()).command({ ping: 1 });
    }
    return Response.json(
      { status: "ok", storage, timestamp: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return Response.json(
      { status: "unavailable", storage, timestamp: new Date().toISOString() },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
