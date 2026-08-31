import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { openShiftSchema } from "@/server/http/schemas";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { markAssignedStaffPresent } from "@/server/services/attendance-service";

export async function GET() {
  return NextResponse.json(await getOperationsRepository().listShifts());
}

export async function POST(request: Request) {
  try {
    const input = openShiftSchema.parse(await request.json());
    const key = request.headers.get("Idempotency-Key") ?? crypto.randomUUID();
    const shift = await getOperationsRepository().openShift(input, key);
    await markAssignedStaffPresent(shift);
    return NextResponse.json(shift, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
