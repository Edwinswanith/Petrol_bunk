import { NextResponse } from "next/server";
import { apiError } from "@/server/http/api-response";
import { fuelTankSchema } from "@/server/http/schemas";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

export async function GET() {
  return NextResponse.json((await getForecourtConfigStore().getConfiguration()).tanks);
}

export async function POST(request: Request) {
  try {
    const tank = await getForecourtConfigStore().createTank(fuelTankSchema.parse(await request.json()));
    return NextResponse.json(tank, { status: 201 });
  } catch (error) { return apiError(error); }
}
