import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { closeShiftSchema } from "@/server/http/schemas";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { reconcileShift } from "@/server/services/shift-reconciliation-service";
import { prepareCloseInput } from "@/server/services/close-input-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = closeShiftSchema.parse(await request.json());
    const shift = await getOperationsRepository().findShift(id);
    if (!shift) throw new Error("Shift not found");
    return NextResponse.json(reconcileShift(shift, await prepareCloseInput(shift, input)));
  } catch (error) {
    return apiError(error);
  }
}
