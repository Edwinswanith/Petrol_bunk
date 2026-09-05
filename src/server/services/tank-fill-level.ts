import Decimal from "decimal.js";

export type TankFillLevel = { percentage: number; status: "critical" | "watch" | "healthy" };

export function tankFillLevel(currentStock: string, capacityLitres: string): TankFillLevel {
  const capacity = new Decimal(capacityLitres || "0");
  const available = new Decimal(currentStock || "0");
  const percentage = capacity.lte(0) ? 0 : Math.max(0, Math.min(100, available.div(capacity).times(100).round().toNumber()));
  const status = percentage <= 20 ? "critical" : percentage <= 45 ? "watch" : "healthy";
  return { percentage, status };
}
