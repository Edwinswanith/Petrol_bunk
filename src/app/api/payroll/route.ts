import { NextResponse } from "next/server";
import { apiError } from "@/server/http/api-response";
import { payrollSchema } from "@/server/http/schemas";
import { getStaffStore } from "@/server/repositories/staff-store";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  return NextResponse.json(await getStaffStore().listPayroll(query.get("month") ?? undefined, query.get("staffId") ?? undefined));
}
export async function POST(request: Request) {
  try { return NextResponse.json(await getStaffStore().savePayroll(payrollSchema.parse(await request.json()))); }
  catch (error) { return apiError(error); }
}
