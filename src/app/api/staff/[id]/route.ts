import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { staffUpdateSchema } from "@/server/http/schemas";
import { getStaffStore } from "@/server/repositories/staff-store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await getStaffStore().updateStaff(id, staffUpdateSchema.parse(await request.json())));
  } catch (error) {
    return apiError(error);
  }
}
