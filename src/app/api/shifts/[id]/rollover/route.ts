import { NextResponse } from "next/server";

import { businessDate } from "@/lib/business-time";
import { apiError } from "@/server/http/api-response";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { markAssignedStaffPresent } from "@/server/services/attendance-service";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const repository = getOperationsRepository();
    const previous = await repository.findShift(id);
    const shift = await repository.rolloverActiveShiftDate(id, businessDate());
    if (previous && previous.businessDate !== shift.businessDate) await markAssignedStaffPresent(shift);
    return NextResponse.json(shift);
  } catch (error) {
    return apiError(error);
  }
}
