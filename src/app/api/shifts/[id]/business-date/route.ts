import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { activeShiftDateCorrectionSchema } from "@/server/http/schemas";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { markAssignedStaffPresent } from "@/server/services/attendance-service";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = activeShiftDateCorrectionSchema.parse(await request.json());
    const previous = await getOperationsRepository().findShift(id);
    const shift = await getOperationsRepository().updateActiveShiftDate(id, input);
    // The previous date's attendance stays as-is — it's genuine attendance for that day, not a mistake to erase.
    if (previous && previous.businessDate !== shift.businessDate) await markAssignedStaffPresent(shift);
    return NextResponse.json(shift);
  } catch (error) {
    return apiError(error);
  }
}
