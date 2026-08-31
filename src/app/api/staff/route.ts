import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { staffSchema } from "@/server/http/schemas";
import { getStaffStore } from "@/server/repositories/staff-store";

export async function GET() {
  return NextResponse.json(await getStaffStore().listStaff());
}

export async function POST(request: Request) {
  try {
    const input = staffSchema.parse(await request.json());
    return NextResponse.json(await getStaffStore().addStaff(input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
