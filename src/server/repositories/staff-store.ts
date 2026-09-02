import { hasMongoConfiguration, getMongoDatabase } from "@/server/db/mongo-client";
import type { AddStaffInput, AttendanceRecord, PayrollRecord, SaveAttendanceInput, SavePayrollInput, StaffRecord, StaffShift, UpdateStaffInput } from "@/server/domain/staff";
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

const defaultStaff: Array<Required<Pick<StaffRecord, "name" | "phone" | "note" | "monthlySalary" | "dailyBeta" | "assignedShift">>> = [
  { name: "Omapathy", phone: "", note: "Shift 1 · ₹150 daily beta; no beta on leave or absence", monthlySalary: "18000", dailyBeta: "150", assignedShift: "SHIFT_1" },
  { name: "Sampath", phone: "", note: "Shift 1 · ₹150 daily beta; no beta on leave or absence", monthlySalary: "18000", dailyBeta: "150", assignedShift: "SHIFT_1" },
  { name: "Nagaraj", phone: "", note: "Shift 2 · fixed monthly salary", monthlySalary: "18000", dailyBeta: "0", assignedShift: "SHIFT_2" },
  { name: "Kavita", phone: "", note: "Shift 2 · fixed monthly salary", monthlySalary: "18000", dailyBeta: "0", assignedShift: "SHIFT_2" }
];
const legacyDefaultNames = ["Arun", "Kumar", "Priya", "Ravi"];
const defaultOrder = new Map(defaultStaff.map((person, index) => [person.name, index]));

function normalizeStaff(record: StaffRecord): StaffRecord {
  return { ...record, monthlySalary: record.monthlySalary ?? "0", dailyBeta: record.dailyBeta ?? "0", assignedShift: record.assignedShift ?? "SHIFT_1" };
}

function sortStaff(a: StaffRecord, b: StaffRecord) {
  return (defaultOrder.get(a.name) ?? 999) - (defaultOrder.get(b.name) ?? 999) || (a.assignedShift ?? "SHIFT_1").localeCompare(b.assignedShift ?? "SHIFT_1") || a.name.localeCompare(b.name);
}

function payrollSettlement(person: StaffRecord, records: AttendanceRecord[], input: SavePayrollInput) {
  const presentDays = records.filter((record) => record.status === "PRESENT").length;
  const lateDays = records.filter((record) => record.status === "LATE").length;
  const absentDays = records.filter((record) => record.status === "ABSENT").length;
  const leaveDays = records.filter((record) => record.status === "LEAVE").length;
  const settlement = calculatePayrollSettlement({
    baseSalary: person.monthlySalary ?? "0", dailyBetaRate: person.dailyBeta ?? "0", eligibleBetaDays: presentDays + lateDays,
    halfDays: input.halfDays, overtime: input.overtime, attendanceDeduction: input.attendanceDeduction,
    advances: input.advances, otherDeductions: input.otherDeductions, amountPaid: input.amountPaid
  });
  return { presentDays, lateDays, absentDays, leaveDays, ...settlement };
}

export function createMemoryStaffStore(options: { seedDefaults?: boolean } = {}) {
  const staff = new Map<string, StaffRecord>();
  const attendance = new Map<string, AttendanceRecord>();
  const payroll = new Map<string, PayrollRecord>();
  if (options.seedDefaults) for (const person of defaultStaff) {
    const now = "2026-09-01T00:00:00.000Z"; const id = `staff-${person.name.toLowerCase()}`;
    staff.set(id, { id, ...person, active: true, createdAt: now, updatedAt: now });
  }
  const store: StaffStore & { clear(): void } = {
    clear() { staff.clear(); attendance.clear(); payroll.clear(); },
    async listStaff() { return [...staff.values()].filter((record) => record.active).map(normalizeStaff).sort(sortStaff).map(clone); },
    async addStaff(input) {
      const existing = [...staff.values()].find((record) => record.name.toLowerCase() === input.name.toLowerCase());
      if (existing) return clone(existing);
      const now = new Date().toISOString();
      const record: StaffRecord = { id: crypto.randomUUID(), ...clone(input), monthlySalary: input.monthlySalary ?? "0", dailyBeta: input.dailyBeta ?? "0", assignedShift: input.assignedShift ?? "SHIFT_1", active: true, createdAt: now, updatedAt: now };
      staff.set(record.id, record);
      return clone(record);
    },
    async updateStaff(id, input) {
      const current = staff.get(id); if (!current) throw new Error("Staff member not found");
      const record = normalizeStaff({ ...current, ...clone(input), updatedAt: new Date().toISOString() });
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
      const settlement = payrollSettlement(person, records, input);
      const record: PayrollRecord = { id, ...clone(input), staffName: person.name, baseSalary: person.monthlySalary ?? "0", ...settlement, createdAt: existing?.createdAt ?? now, updatedAt: now };
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
        const now = new Date().toISOString(); const id = `staff-${person.name.toLowerCase()}`;
        await collection.updateOne({ name: person.name }, { $setOnInsert: { _id: id, id, ...person, active: true, createdAt: now, updatedAt: now } }, { upsert: true });
        await collection.updateOne({ name: person.name, assignedShift: { $exists: false } }, { $set: { assignedShift: person.assignedShift as StaffShift, updatedAt: now } });
        await collection.updateOne({ name: person.name, dailyBeta: { $exists: false } }, { $set: { dailyBeta: person.dailyBeta, updatedAt: now } });
        await collection.updateOne({ name: person.name, $or: [{ monthlySalary: { $exists: false } }, { monthlySalary: "0" }] }, { $set: { monthlySalary: person.monthlySalary, updatedAt: now } });
      }
      await collection.updateMany({ name: { $in: legacyDefaultNames }, note: "Initial forecourt operator" }, { $set: { active: false, updatedAt: new Date().toISOString() } });
    })();
    return defaultsReady;
  };
  return {
    async listStaff() {
      await ensureDefaults(); const db = await getMongoDatabase();
      return (await db.collection<StoredStaff>("staff").find({ active: true }).toArray()).map((record) => normalizeStaff(withoutId(record) as StaffRecord)).sort(sortStaff);
    },
    async addStaff(input) {
      const db = await getMongoDatabase();
      await db.collection<StoredStaff>("staff").createIndex({ name: 1 }, { unique: true });
      const existing = await db.collection<StoredStaff>("staff").findOne({ name: input.name });
      if (existing) return withoutId(existing) as StaffRecord;
      const now = new Date().toISOString();
      const record: StaffRecord = { id: crypto.randomUUID(), ...input, monthlySalary: input.monthlySalary ?? "0", dailyBeta: input.dailyBeta ?? "0", assignedShift: input.assignedShift ?? "SHIFT_1", active: true, createdAt: now, updatedAt: now };
      await db.collection<StoredStaff>("staff").insertOne({ ...record, _id: record.id });
      return record;
    },
    async updateStaff(id, input) {
      const db = await getMongoDatabase(); const now = new Date().toISOString();
      const updated = await db.collection<StoredStaff>("staff").findOneAndUpdate({ _id: id }, { $set: { ...input, updatedAt: now } }, { returnDocument: "after" });
      if (!updated) throw new Error("Staff member not found");
      return normalizeStaff(withoutId(updated) as StaffRecord);
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
      const settlement = payrollSettlement(normalizeStaff(withoutId(person) as StaffRecord), records, input);
      const record: PayrollRecord = { id, ...input, staffName: person.name, baseSalary: person.monthlySalary ?? "0", ...settlement, createdAt: existing?.createdAt ?? now, updatedAt: now };
      await db.collection<StoredPayroll>("payroll").replaceOne({ _id: id }, { ...record } as StoredPayroll, { upsert: true }); return record;
    }
  };
}

declare global { var forecourtStaffStore: StaffStore | undefined; }
export function getStaffStore(): StaffStore {
  if (!globalThis.forecourtStaffStore) globalThis.forecourtStaffStore = hasMongoConfiguration() ? createMongoStaffStore() : createMemoryStaffStore({ seedDefaults: true });
  return globalThis.forecourtStaffStore;
}
