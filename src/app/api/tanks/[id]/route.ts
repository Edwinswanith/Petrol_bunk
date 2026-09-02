import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { tankStockAdjustmentSchema } from "@/server/http/schemas";
import { getOperationsRepository } from "@/server/repositories/repository-provider";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = tankStockAdjustmentSchema.parse(await request.json());
    const movement = await getOperationsRepository().adjustTankStock({ tankId: id, ...input });
    return NextResponse.json(movement);
  } catch (error) {
    return apiError(error);
  }
}
