import { NextResponse } from "next/server";
import { apiError } from "@/server/http/api-response";
import { fuelPriceSchema } from "@/server/http/schemas";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const product = await getForecourtConfigStore().updateProductPrice(id, fuelPriceSchema.parse(await request.json()));
    return NextResponse.json(product);
  } catch (error) { return apiError(error); }
}
