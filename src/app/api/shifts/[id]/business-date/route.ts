import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { activeShiftDateCorrectionSchema } from "@/server/http/schemas";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { getStaffStore } from "@/server/repositories/staff-store";
import { markAssignedStaffPresent } from "@/server/services/attendance-service";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = activeShiftDateCorrectionSchema.parse(await request.json());
    const previous = await getOperationsRepository().findShift(id);
    const shift = await getOperationsRepository().updateActiveShiftDate(id, input);
    if (previous && previous.businessDate !== shift.businessDate) {
      const staffIds = [...new Set((shift.staffAssignments ?? []).map((assignment) => assignment.staffId))];
      await Promise.all(staffIds.map((staffId) => getStaffStore().deleteAttendance(staffId, previous.businessDate)));
      await markAssignedStaffPresent(shift);
    }
    return NextResponse.json(shift);
  } catch (error) {
    return apiError(error);
  }
}
