import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryStaffStore } from "@/server/repositories/staff-store";

describe("memory staff store", () => {
  const store = createMemoryStaffStore();

  beforeEach(() => store.clear());

  it("adds staff and updates one attendance record per business date", async () => {
    const staff = await store.addStaff({ name: "Arun", phone: "9876543210", note: "Senior operator", monthlySalary: "18000" });
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

    await store.updateStaff(staff.id, { monthlySalary: "20000" });
    expect(await store.listStaff()).toEqual([expect.objectContaining({ name: "Arun", monthlySalary: "20000", active: true })]);
    expect(await store.listAttendance("2026-08-31")).toEqual([
      expect.objectContaining({ staffName: "Arun", status: "LATE", checkIn: "06:15", checkOut: "14:10" })
    ]);
  });

  it("stores an attendance-aware monthly payroll settlement and balance", async () => {
    const person = await store.addStaff({ name: "Meera", phone: "", note: "", monthlySalary: "20000" });
    await store.saveAttendance({ staffId: person.id, businessDate: "2026-09-01", status: "PRESENT", note: "" });
    await store.saveAttendance({ staffId: person.id, businessDate: "2026-09-02", status: "ABSENT", note: "" });
    const payroll = await store.savePayroll({ staffId: person.id, month: "2026-09", halfDays: 1, overtime: "1000", attendanceDeduction: "500", advances: "2000", otherDeductions: "0", amountPaid: "10000", note: "Part payment" });
    expect(payroll).toEqual(expect.objectContaining({ presentDays: 1, absentDays: 1, grossPay: "21000.00", netPay: "18500.00", amountPaid: "10000.00", balanceDue: "8500.00" }));
    expect(await store.listPayroll("2026-09", person.id)).toEqual([expect.objectContaining({ id: `${person.id}:2026-09`, note: "Part payment" })]);
  });

  it("seeds four assumed operators at ₹18,000 without duplicating them", async () => {
    const seeded = createMemoryStaffStore({ seedDefaults: true });
    expect(await seeded.listStaff()).toEqual([
      expect.objectContaining({ name: "Arun", monthlySalary: "18000" }),
      expect.objectContaining({ name: "Kumar", monthlySalary: "18000" }),
      expect.objectContaining({ name: "Priya", monthlySalary: "18000" }),
      expect.objectContaining({ name: "Ravi", monthlySalary: "18000" })
    ]);
  });
});
