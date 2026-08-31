import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { closeShiftSchema } from "@/server/http/schemas";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { prepareCloseInput } from "@/server/services/close-input-service";
import { markAssignedStaffCheckedOut } from "@/server/services/attendance-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = closeShiftSchema.parse(await request.json());
    const key = request.headers.get("Idempotency-Key") ?? crypto.randomUUID();
    const repository = getOperationsRepository();
    const shift = await repository.findShift(id);
    if (!shift) throw new Error("Shift not found");
    const closed = await repository.closeShift(id, await prepareCloseInput(shift, input), key);
    await markAssignedStaffCheckedOut(closed);
    return NextResponse.json(closed);
  } catch (error) {
    return apiError(error);
  }
}
