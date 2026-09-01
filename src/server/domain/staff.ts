export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "LEAVE";

export type StaffRecord = {
  id: string;
  name: string;
  phone: string;
  note: string;
  monthlySalary?: string;
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

export type PayrollRecord = {
  id: string; staffId: string; staffName: string; month: string; baseSalary: string;
  presentDays: number; lateDays: number; absentDays: number; leaveDays: number; halfDays: number;
  overtime: string; attendanceDeduction: string; advances: string; otherDeductions: string;
  grossPay: string; totalDeductions: string; netPay: string; amountPaid: string; balanceDue: string;
  note: string; createdAt: string; updatedAt: string;
};

export type AddStaffInput = Pick<StaffRecord, "name" | "phone" | "note" | "monthlySalary">;
export type UpdateStaffInput = Pick<StaffRecord, "monthlySalary">;
export type SaveAttendanceInput = Pick<AttendanceRecord, "staffId" | "businessDate" | "status" | "note"> &
  Partial<Pick<AttendanceRecord, "checkIn" | "checkOut" | "shiftId">>;
export type SavePayrollInput = Pick<PayrollRecord, "staffId" | "month" | "halfDays" | "overtime" | "attendanceDeduction" | "advances" | "otherDeductions" | "amountPaid" | "note">;
