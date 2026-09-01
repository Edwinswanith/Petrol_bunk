import { businessTime } from "@/lib/business-time";
import type { ShiftRecord } from "@/server/domain/operations";
import { getStaffStore } from "@/server/repositories/staff-store";

export async function markAssignedStaffPresent(shift: ShiftRecord) {
  const store = getStaffStore();
  const existing = await store.listAttendance(shift.businessDate);
  const assignments = [...new Map((shift.staffAssignments ?? []).map((assignment) => [assignment.staffId, assignment])).values()];
  await Promise.all(assignments.map((assignment) => {
    const current = existing.find((record) => record.staffId === assignment.staffId);
    return store.saveAttendance({
      staffId: assignment.staffId,
      businessDate: shift.businessDate,
      status: current?.status === "LATE" ? "LATE" : "PRESENT",
      checkIn: current?.checkIn ?? businessTime(),
      checkOut: current?.checkOut,
      note: current?.note ?? "Assigned at shift opening",
      shiftId: shift.id
    });
  }));
}

export async function markAssignedStaffCheckedOut(shift: ShiftRecord) {
  const store = getStaffStore();
  const existing = await store.listAttendance(shift.businessDate);
  const assignments = [...new Map((shift.staffAssignments ?? []).map((assignment) => [assignment.staffId, assignment])).values()];
  await Promise.all(assignments.map((assignment) => {
    const current = existing.find((record) => record.staffId === assignment.staffId);
    return store.saveAttendance({
      staffId: assignment.staffId,
      businessDate: shift.businessDate,
      status: current?.status ?? "PRESENT",
      checkIn: current?.checkIn,
      checkOut: current?.checkOut ?? businessTime(),
      note: current?.note ?? "",
      shiftId: shift.id
    });
  }));
}
