import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { activeShiftCorrectionSchema } from "@/server/http/schemas";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { markAssignedStaffPresent } from "@/server/services/attendance-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const shift = await getOperationsRepository().findShift(id);
  if (!shift) return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  return NextResponse.json(shift);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const shift = await getOperationsRepository().updateActiveShift(id, activeShiftCorrectionSchema.parse(await request.json()));
    await markAssignedStaffPresent(shift);
    return NextResponse.json(shift);
  } catch (error) {
    return apiError(error);
  }
}
