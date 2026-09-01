import { NextResponse } from "next/server";
import { apiError } from "@/server/http/api-response";
import { fuelProductSchema } from "@/server/http/schemas";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

export async function GET() {
  return NextResponse.json((await getForecourtConfigStore().getConfiguration()).products);
}

export async function POST(request: Request) {
  try {
    const product = await getForecourtConfigStore().createProduct(fuelProductSchema.parse(await request.json()));
    return NextResponse.json(product, { status: 201 });
  } catch (error) { return apiError(error); }
}
