import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { shiftPumpProgressSchema } from "@/server/http/schemas";
import { getOperationsRepository } from "@/server/repositories/repository-provider";

export async function PATCH(request: Request, context: { params: Promise<{ id: string; pumpId: string }> }) {
  try {
    const { id, pumpId } = await context.params;
    const input = shiftPumpProgressSchema.parse(await request.json());
    const shift = await getOperationsRepository().saveShiftPumpProgress(id, pumpId, input);
    return NextResponse.json(shift);
  } catch (error) {
    return apiError(error);
  }
}
