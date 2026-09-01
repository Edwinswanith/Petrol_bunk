import { NextResponse } from "next/server";
import { apiError } from "@/server/http/api-response";
import { fuelStationSchema } from "@/server/http/schemas";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

export async function GET() {
  return NextResponse.json((await getForecourtConfigStore().getConfiguration()).stations);
}

export async function POST(request: Request) {
  try {
    const station = await getForecourtConfigStore().createStation(fuelStationSchema.parse(await request.json()));
    return NextResponse.json(station, { status: 201 });
  } catch (error) { return apiError(error); }
}
