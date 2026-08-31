import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { densityCheckSchema } from "@/server/http/schemas";
import { listDensityChecks, saveDensityCheck } from "@/server/repositories/quality-store";

export async function GET() {
  return NextResponse.json(await listDensityChecks());
}

export async function POST(request: Request) {
  try {
    const key = request.headers.get("Idempotency-Key") ?? crypto.randomUUID();
    const input = densityCheckSchema.parse(await request.json());
    return NextResponse.json(await saveDensityCheck(input, key), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
