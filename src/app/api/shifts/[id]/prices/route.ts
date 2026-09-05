import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { activeShiftPriceUpdateSchema } from "@/server/http/schemas";
import { getOperationsRepository } from "@/server/repositories/repository-provider";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const shift = await getOperationsRepository().updateActiveShiftPrices(id, activeShiftPriceUpdateSchema.parse(await request.json()));
    return NextResponse.json(shift);
  } catch (error) {
    return apiError(error);
  }
}
