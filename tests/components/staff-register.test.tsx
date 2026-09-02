import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StaffRegister } from "@/components/staff/staff-register";
import type { StaffRecord } from "@/server/domain/staff";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const now = "2026-09-02T00:00:00.000Z";
const staff: StaffRecord[] = [
  { id: "staff-omapathy", name: "Omapathy", phone: "", note: "", monthlySalary: "18000", dailyBeta: "150", assignedShift: "SHIFT_1", active: true, createdAt: now, updatedAt: now },
  { id: "staff-sampath", name: "Sampath", phone: "", note: "", monthlySalary: "18000", dailyBeta: "150", assignedShift: "SHIFT_1", active: true, createdAt: now, updatedAt: now },
  { id: "staff-nagaraj", name: "Nagaraj", phone: "", note: "", monthlySalary: "18000", dailyBeta: "0", assignedShift: "SHIFT_2", active: true, createdAt: now, updatedAt: now },
  { id: "staff-kavita", name: "Kavita", phone: "", note: "", monthlySalary: "18000", dailyBeta: "0", assignedShift: "SHIFT_2", active: true, createdAt: now, updatedAt: now }
];

describe("StaffRegister", () => {
  it("shows the two shift policies and editable daily beta values", () => {
    render(<StaffRegister staff={staff} attendance={[]} payroll={[]} date="2026-09-02" month="2026-09" />);

    expect(screen.getByText(/Omapathy and Sampath receive ₹18,000 fixed salary plus ₹150 beta/i)).toBeInTheDocument();
    expect(screen.getByText(/Nagaraj and Kavita receive a fixed ₹18,000 salary/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Omapathy daily beta")).toHaveValue(150);
    expect(screen.getByLabelText("Nagaraj daily beta")).toHaveValue(0);
    expect(screen.getByLabelText("Kavita assigned shift")).toHaveValue("SHIFT_2");
  });
});
