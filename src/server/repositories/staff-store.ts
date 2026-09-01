import { hasMongoConfiguration, getMongoDatabase } from "@/server/db/mongo-client";
import type { AddStaffInput, AttendanceRecord, PayrollRecord, SaveAttendanceInput, SavePayrollInput, StaffRecord, UpdateStaffInput } from "@/server/domain/staff";
import { calculatePayrollSettlement } from "@/server/services/payroll-service";

export type StaffStore = {
  listStaff(): Promise<StaffRecord[]>;
  addStaff(input: AddStaffInput): Promise<StaffRecord>;
  updateStaff(id: string, input: UpdateStaffInput): Promise<StaffRecord>;
  listAttendance(businessDate?: string): Promise<AttendanceRecord[]>;
  saveAttendance(input: SaveAttendanceInput): Promise<AttendanceRecord>;
  listPayroll(month?: string, staffId?: string): Promise<PayrollRecord[]>;
  savePayroll(input: SavePayrollInput): Promise<PayrollRecord>;
};

function clone<T>(value: T): T { return structuredClone(value); }

const defaultStaff = ["Arun", "Kumar", "Priya", "Ravi"].map((name) => ({ name, phone: "", note: "Initial forecourt operator", monthlySalary: "18000" }));

export function createMemoryStaffStore(options: { seedDefaults?: boolean } = {}) {
  const staff = new Map<string, StaffRecord>();
  const attendance = new Map<string, AttendanceRecord>();
  const payroll = new Map<string, PayrollRecord>();
  if (options.seedDefaults) for (const person of defaultStaff) {
    const now = "2026-09-01T00:00:00.000Z"; const id = person.name.toLowerCase();
    staff.set(id, { id, ...person, active: true, createdAt: now, updatedAt: now });
  }
  const store: StaffStore & { clear(): void } = {
    clear() { staff.clear(); attendance.clear(); payroll.clear(); },
    async listStaff() { return [...staff.values()].sort((a, b) => a.name.localeCompare(b.name)).map((record) => clone({ ...record, monthlySalary: record.monthlySalary ?? "0" })); },
    async addStaff(input) {
      const existing = [...staff.values()].find((record) => record.name.toLowerCase() === input.name.toLowerCase());
      if (existing) return clone(existing);
      const now = new Date().toISOString();
      const record: StaffRecord = { id: crypto.randomUUID(), ...clone(input), active: true, createdAt: now, updatedAt: now };
      staff.set(record.id, record);
      return clone(record);
    },
    async updateStaff(id, input) {
      const current = staff.get(id); if (!current) throw new Error("Staff member not found");
      const record = { ...current, ...clone(input), updatedAt: new Date().toISOString() };
      staff.set(id, record); return clone(record);
    },
    async listAttendance(businessDate) {
      return [...attendance.values()].filter((record) => !businessDate || record.businessDate === businessDate)
        .sort((a, b) => b.businessDate.localeCompare(a.businessDate) || a.staffName.localeCompare(b.staffName)).map(clone);
    },
    async saveAttendance(input) {
      const person = staff.get(input.staffId);
      if (!person) throw new Error("Staff member not found");
      const id = `${input.staffId}:${input.businessDate}`;
      const existing = attendance.get(id);
      const now = new Date().toISOString();
      const record: AttendanceRecord = {
        id, staffId: person.id, staffName: person.name, businessDate: input.businessDate,
        status: input.status, checkIn: input.checkIn, checkOut: input.checkOut, note: input.note,
        shiftId: input.shiftId ?? existing?.shiftId, createdAt: existing?.createdAt ?? now, updatedAt: now
      };
      attendance.set(id, record);
      return clone(record);
    },
    async listPayroll(month, staffId) {
      return [...payroll.values()].filter((record) => (!month || record.month === month) && (!staffId || record.staffId === staffId)).sort((a, b) => b.month.localeCompare(a.month)).map(clone);
    },
    async savePayroll(input) {
      const person = staff.get(input.staffId); if (!person) throw new Error("Staff member not found");
      const id = `${input.staffId}:${input.month}`; const existing = payroll.get(id); const now = new Date().toISOString();
      const records = [...attendance.values()].filter((record) => record.staffId === input.staffId && record.businessDate.startsWith(input.month));
      const settlement = calculatePayrollSettlement({ baseSalary: person.monthlySalary ?? "0", overtime: input.overtime, attendanceDeduction: input.attendanceDeduction, advances: input.advances, otherDeductions: input.otherDeductions, amountPaid: input.amountPaid });
      const record: PayrollRecord = { id, ...clone(input), staffName: person.name, baseSalary: person.monthlySalary ?? "0", presentDays: records.filter((r) => r.status === "PRESENT").length, lateDays: records.filter((r) => r.status === "LATE").length, absentDays: records.filter((r) => r.status === "ABSENT").length, leaveDays: records.filter((r) => r.status === "LEAVE").length, ...settlement, createdAt: existing?.createdAt ?? now, updatedAt: now };
      payroll.set(id, record); return clone(record);
    }
  };
  return store;
}

type StoredStaff = StaffRecord & { _id: string };
type StoredAttendance = AttendanceRecord & { _id: string };
type StoredPayroll = PayrollRecord & { _id: string };
function withoutId<T extends { _id: string }>(record: T): Omit<T, "_id"> { const { _id, ...value } = record; void _id; return value; }

function createMongoStaffStore(): StaffStore {
  let defaultsReady: Promise<void> | undefined;
  const ensureDefaults = async () => {
    defaultsReady ??= (async () => {
      const db = await getMongoDatabase(); const collection = db.collection<StoredStaff>("staff");
      await collection.createIndex({ name: 1 }, { unique: true });
      for (const person of defaultStaff) {
        const existing = await collection.findOne({ name: person.name }); const now = new Date().toISOString();
        if (!existing) { const id = crypto.randomUUID(); await collection.insertOne({ _id: id, id, ...person, active: true, createdAt: now, updatedAt: now }); }
        else if (!existing.monthlySalary || existing.monthlySalary === "0") await collection.updateOne({ _id: existing._id }, { $set: { monthlySalary: "18000", updatedAt: now } });
      }
    })();
    return defaultsReady;
  };
  return {
    async listStaff() {
      await ensureDefaults(); const db = await getMongoDatabase();
      return (await db.collection<StoredStaff>("staff").find().sort({ name: 1 }).toArray()).map((record) => ({ ...(withoutId(record) as StaffRecord), monthlySalary: record.monthlySalary ?? "0" }));
    },
    async addStaff(input) {
      const db = await getMongoDatabase();
      await db.collection<StoredStaff>("staff").createIndex({ name: 1 }, { unique: true });
      const existing = await db.collection<StoredStaff>("staff").findOne({ name: input.name });
      if (existing) return withoutId(existing) as StaffRecord;
      const now = new Date().toISOString();
      const record: StaffRecord = { id: crypto.randomUUID(), ...input, active: true, createdAt: now, updatedAt: now };
      await db.collection<StoredStaff>("staff").insertOne({ ...record, _id: record.id });
      return record;
    },
    async updateStaff(id, input) {
      const db = await getMongoDatabase(); const now = new Date().toISOString();
      const updated = await db.collection<StoredStaff>("staff").findOneAndUpdate({ _id: id }, { $set: { ...input, updatedAt: now } }, { returnDocument: "after" });
      if (!updated) throw new Error("Staff member not found");
      return { ...(withoutId(updated) as StaffRecord), monthlySalary: updated.monthlySalary ?? "0" };
    },
    async listAttendance(businessDate) {
      const db = await getMongoDatabase();
      const query = businessDate ? { businessDate } : {};
      return (await db.collection<StoredAttendance>("attendance").find(query).sort({ businessDate: -1, staffName: 1 }).toArray()).map((record) => withoutId(record) as AttendanceRecord);
    },
    async saveAttendance(input) {
      const db = await getMongoDatabase();
      const person = await db.collection<StoredStaff>("staff").findOne({ _id: input.staffId });
      if (!person) throw new Error("Staff member not found");
      const id = `${input.staffId}:${input.businessDate}`;
      const existing = await db.collection<StoredAttendance>("attendance").findOne({ _id: id });
      const now = new Date().toISOString();
      const record: AttendanceRecord = {
        id, staffId: person.id, staffName: person.name, businessDate: input.businessDate,
        status: input.status, checkIn: input.checkIn, checkOut: input.checkOut, note: input.note,
        shiftId: input.shiftId ?? existing?.shiftId, createdAt: existing?.createdAt ?? now, updatedAt: now
      };
      await db.collection<StoredAttendance>("attendance").replaceOne({ _id: id }, { ...record } as StoredAttendance, { upsert: true });
      return record;
    },
    async listPayroll(month, staffId) {
      const db = await getMongoDatabase(); const query: Record<string, string> = {};
      if (month) query.month = month; if (staffId) query.staffId = staffId;
      return (await db.collection<StoredPayroll>("payroll").find(query).sort({ month: -1 }).toArray()).map((record) => withoutId(record) as PayrollRecord);
    },
    async savePayroll(input) {
      const db = await getMongoDatabase(); const person = await db.collection<StoredStaff>("staff").findOne({ _id: input.staffId });
      if (!person) throw new Error("Staff member not found");
      const id = `${input.staffId}:${input.month}`; const existing = await db.collection<StoredPayroll>("payroll").findOne({ _id: id }); const now = new Date().toISOString();
      const records = await db.collection<StoredAttendance>("attendance").find({ staffId: input.staffId, businessDate: { $regex: `^${input.month}` } }).toArray();
      const settlement = calculatePayrollSettlement({ baseSalary: person.monthlySalary ?? "0", overtime: input.overtime, attendanceDeduction: input.attendanceDeduction, advances: input.advances, otherDeductions: input.otherDeductions, amountPaid: input.amountPaid });
      const record: PayrollRecord = { id, ...input, staffName: person.name, baseSalary: person.monthlySalary ?? "0", presentDays: records.filter((r) => r.status === "PRESENT").length, lateDays: records.filter((r) => r.status === "LATE").length, absentDays: records.filter((r) => r.status === "ABSENT").length, leaveDays: records.filter((r) => r.status === "LEAVE").length, ...settlement, createdAt: existing?.createdAt ?? now, updatedAt: now };
      await db.collection<StoredPayroll>("payroll").replaceOne({ _id: id }, { ...record } as StoredPayroll, { upsert: true }); return record;
    }
  };
}

declare global { var forecourtStaffStore: StaffStore | undefined; }
export function getStaffStore(): StaffStore {
  if (!globalThis.forecourtStaffStore) globalThis.forecourtStaffStore = hasMongoConfiguration() ? createMongoStaffStore() : createMemoryStaffStore({ seedDefaults: true });
  return globalThis.forecourtStaffStore;
}
