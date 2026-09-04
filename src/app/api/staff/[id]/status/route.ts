import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { staffStatusSchema } from "@/server/http/schemas";
import { getStaffStore } from "@/server/repositories/staff-store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { active, reason } = staffStatusSchema.parse(await request.json());
    return NextResponse.json(await getStaffStore().setStaffStatus(id, active, reason));
  } catch (error) {
    return apiError(error);
  }
}
