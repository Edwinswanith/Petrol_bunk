import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api-response";
import { expenseSchema } from "@/server/http/schemas";
import { listExpenses, saveExpense } from "@/server/repositories/journal-store";
import { getOperationsRepository } from "@/server/repositories/repository-provider";

export async function GET() {
  return NextResponse.json(await listExpenses());
}

export async function POST(request: Request) {
  try {
    const key = request.headers.get("Idempotency-Key") ?? crypto.randomUUID();
    const activeShift = (await getOperationsRepository().listShifts()).find((shift) => shift.state === "OPEN");
    return NextResponse.json(
      await saveExpense(expenseSchema.parse(await request.json()), key, activeShift?.id),
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
