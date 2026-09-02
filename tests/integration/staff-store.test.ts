import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryStaffStore } from "@/server/repositories/staff-store";

describe("memory staff store", () => {
  const store = createMemoryStaffStore();

  beforeEach(() => store.clear());

  it("adds staff and updates one attendance record per business date", async () => {
    const staff = await store.addStaff({ name: "Arun", phone: "9876543210", note: "Senior operator", monthlySalary: "18000", assignedShift: "SHIFT_1", dailyBeta: "150" });
    await store.saveAttendance({
      staffId: staff.id,
      businessDate: "2026-08-31",
      status: "PRESENT",
      checkIn: "06:00",
      note: ""
    });
    await store.saveAttendance({
      staffId: staff.id,
      businessDate: "2026-08-31",
      status: "LATE",
      checkIn: "06:15",
      checkOut: "14:10",
      note: "Traffic"
    });

    await store.updateStaff(staff.id, { monthlySalary: "20000", assignedShift: "SHIFT_2", dailyBeta: "0" });
    expect(await store.listStaff()).toEqual([expect.objectContaining({ name: "Arun", monthlySalary: "20000", assignedShift: "SHIFT_2", dailyBeta: "0", active: true })]);
    expect(await store.listAttendance("2026-08-31")).toEqual([
      expect.objectContaining({ staffName: "Arun", status: "LATE", checkIn: "06:15", checkOut: "14:10" })
    ]);
  });

  it("stores an attendance-aware monthly payroll settlement and balance", async () => {
    const person = await store.addStaff({ name: "Meera", phone: "", note: "", monthlySalary: "20000", assignedShift: "SHIFT_1", dailyBeta: "150" });
    await store.saveAttendance({ staffId: person.id, businessDate: "2026-09-01", status: "PRESENT", note: "" });
    await store.saveAttendance({ staffId: person.id, businessDate: "2026-09-02", status: "LATE", note: "" });
    await store.saveAttendance({ staffId: person.id, businessDate: "2026-09-03", status: "LEAVE", note: "" });
    await store.saveAttendance({ staffId: person.id, businessDate: "2026-09-04", status: "ABSENT", note: "" });
    const payroll = await store.savePayroll({ staffId: person.id, month: "2026-09", halfDays: 1, overtime: "1000", attendanceDeduction: "500", advances: "2000", otherDeductions: "0", amountPaid: "10000", note: "Part payment" });
    expect(payroll).toEqual(expect.objectContaining({
      presentDays: 1, lateDays: 1, absentDays: 1, leaveDays: 1,
      dailyBetaRate: "150.00", betaDays: 1.5, betaEarned: "225.00",
      grossPay: "21225.00", netPay: "18725.00", amountPaid: "10000.00", balanceDue: "8725.00"
    }));
    expect(await store.listPayroll("2026-09", person.id)).toEqual([expect.objectContaining({ id: `${person.id}:2026-09`, note: "Part payment" })]);
  });

  it("seeds the four actual operators with their shift and pay policy", async () => {
    const seeded = createMemoryStaffStore({ seedDefaults: true });
    expect(await seeded.listStaff()).toEqual([
      expect.objectContaining({ name: "Omapathy", assignedShift: "SHIFT_1", monthlySalary: "18000", dailyBeta: "150" }),
      expect.objectContaining({ name: "Sampath", assignedShift: "SHIFT_1", monthlySalary: "18000", dailyBeta: "150" }),
      expect.objectContaining({ name: "Nagaraj", assignedShift: "SHIFT_2", monthlySalary: "18000", dailyBeta: "0" }),
      expect.objectContaining({ name: "Kavita", assignedShift: "SHIFT_2", monthlySalary: "18000", dailyBeta: "0" })
    ]);
  });
});
