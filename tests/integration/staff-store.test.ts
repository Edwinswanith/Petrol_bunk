import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryStaffStore } from "@/server/repositories/staff-store";

describe("memory staff store", () => {
  const store = createMemoryStaffStore();

  beforeEach(() => store.clear());

  it("adds staff and updates one attendance record per business date", async () => {
    const staff = await store.addStaff({ name: "Arun", phone: "9876543210", note: "Senior operator" });
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

    expect(await store.listStaff()).toEqual([expect.objectContaining({ name: "Arun", active: true })]);
    expect(await store.listAttendance("2026-08-31")).toEqual([
      expect.objectContaining({ staffName: "Arun", status: "LATE", checkIn: "06:15", checkOut: "14:10" })
    ]);
  });
});
