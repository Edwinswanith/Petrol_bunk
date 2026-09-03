import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { fuelReceiptUpdateSchema, fuelReceiptVoidSchema } from "@/server/http/schemas";
import { updateFuelReceipt, voidFuelReceipt } from "@/server/repositories/journal-store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = fuelReceiptUpdateSchema.parse(await request.json());
    return NextResponse.json(await updateFuelReceipt(id, input));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { reason } = fuelReceiptVoidSchema.parse(await request.json());
    return NextResponse.json(await voidFuelReceipt(id, reason));
  } catch (error) {
    return apiError(error);
  }
}
