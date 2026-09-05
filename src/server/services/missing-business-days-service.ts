type ShiftDateRecord = { state: "OPEN" | "CLOSED"; businessDate: string };

function addDays(date: string, delta: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + delta);
  return next.toISOString().slice(0, 10);
}

export function findMissingBusinessDays(shifts: ShiftDateRecord[], today: string): string[] {
  const closedDates = shifts.filter((shift) => shift.state === "CLOSED").map((shift) => shift.businessDate).sort();
  if (!closedDates.length) return [];
  const lastClosed = closedDates[closedDates.length - 1];
  const recorded = new Set(shifts.map((shift) => shift.businessDate));
  const missing: string[] = [];
  for (let cursor = addDays(lastClosed, 1); cursor < today; cursor = addDays(cursor, 1)) {
    if (!recorded.has(cursor)) missing.push(cursor);
  }
  return missing;
}
