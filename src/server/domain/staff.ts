export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "LEAVE";

export type StaffRecord = {
  id: string;
  name: string;
  phone: string;
  note: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceRecord = {
  id: string;
  staffId: string;
  staffName: string;
  businessDate: string;
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  note: string;
  shiftId?: string;
  createdAt: string;
  updatedAt: string;
};

export type AddStaffInput = Pick<StaffRecord, "name" | "phone" | "note">;
export type SaveAttendanceInput = Pick<AttendanceRecord, "staffId" | "businessDate" | "status" | "note"> &
  Partial<Pick<AttendanceRecord, "checkIn" | "checkOut" | "shiftId">>;
