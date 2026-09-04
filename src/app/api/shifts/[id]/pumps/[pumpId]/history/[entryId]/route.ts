import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { pumpShiftCorrectionSchema } from "@/server/http/schemas";
import { getOperationsRepository } from "@/server/repositories/repository-provider";

export async function PATCH(request: Request, context: { params: Promise<{ id: string; pumpId: string; entryId: string }> }) {
  try {
    const { id, pumpId, entryId } = await context.params;
    const input = pumpShiftCorrectionSchema.parse(await request.json());
    const shift = await getOperationsRepository().correctPumpShiftEntry(id, pumpId, entryId, input);
    return NextResponse.json(shift);
  } catch (error) {
    return apiError(error);
  }
}
