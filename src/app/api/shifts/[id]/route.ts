import { NextResponse } from "next/server";

import { getOperationsRepository } from "@/server/repositories/repository-provider";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const shift = await getOperationsRepository().findShift(id);
  if (!shift) return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  return NextResponse.json(shift);
}
