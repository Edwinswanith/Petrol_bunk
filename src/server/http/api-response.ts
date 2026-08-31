import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { CalculationError } from "@/server/calculations/reconciliation";

export function apiError(error: unknown) {
  const requestId = crypto.randomUUID();
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Please check the highlighted values.", code: "VALIDATION_FAILED", details: error.issues, requestId },
      { status: 400 }
    );
  }
  if (error instanceof CalculationError) {
    return NextResponse.json(
      { error: error.message, code: "CALCULATION_FAILED", requestId },
      { status: 422 }
    );
  }
  const message = error instanceof Error ? error.message : "";
  if (message === "Shift not found") {
    return NextResponse.json({ error: message, code: "NOT_FOUND", requestId }, { status: 404 });
  }
  if (
    message === "Shift is already closed" ||
    message === "Close the active shift before opening another" ||
    message === "Closed shifts are immutable in v1" ||
    message.startsWith("Shift changed on another device")
  ) {
    return NextResponse.json({ error: message, code: "STATE_CONFLICT", requestId }, { status: 409 });
  }
  if (message.startsWith("Unknown nozzle:") || message.startsWith("Missing closing")) {
    return NextResponse.json({ error: message, code: "COMMAND_FAILED", requestId }, { status: 400 });
  }
  return NextResponse.json(
    { error: "Unexpected server error", code: "INTERNAL_ERROR", requestId },
    { status: 500 }
  );
}
