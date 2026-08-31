import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { attendanceSchema } from "@/server/http/schemas";
import { getStaffStore } from "@/server/repositories/staff-store";

export async function GET(request: Request) {
  const businessDate = new URL(request.url).searchParams.get("businessDate") ?? undefined;
  return NextResponse.json(await getStaffStore().listAttendance(businessDate));
}

export async function POST(request: Request) {
  try {
    const input = attendanceSchema.parse(await request.json());
    return NextResponse.json(await getStaffStore().saveAttendance(input));
  } catch (error) {
    return apiError(error);
  }
}
