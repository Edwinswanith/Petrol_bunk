import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaffRegister } from "@/components/staff/staff-register";
import type { StaffRecord } from "@/server/domain/staff";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());

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

  it("marks a staff member resigned after a reason is entered, without touching other staff", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>(async () => ({ ok: true, json: async () => ({ id: "staff-omapathy", active: false }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<StaffRegister staff={staff} attendance={[]} payroll={[]} date="2026-09-02" month="2026-09" />);

    const resignButtons = screen.getAllByRole("button", { name: /mark resigned/i });
    expect(resignButtons).toHaveLength(4);
    await user.click(resignButtons[0]);

    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(screen.getByText(/enter a reason/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Reason Omapathy is resigning"), "Left for another job");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/staff/staff-omapathy/status", expect.objectContaining({ method: "PATCH" })));
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse((request as RequestInit).body as string)).toEqual({ active: false, reason: "Left for another job" });
  });

  it("shows resigned staff separately with their reason, and reactivates them on request", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>(async () => ({ ok: true, json: async () => ({ id: "staff-deepa", active: true }) }));
    vi.stubGlobal("fetch", fetchMock);
    const resignedStaff: StaffRecord[] = [
      { id: "staff-deepa", name: "Deepa", phone: "", note: "", monthlySalary: "18000", dailyBeta: "0", assignedShift: "SHIFT_1", active: false, statusReason: "Left for another job", createdAt: now, updatedAt: now }
    ];
    render(<StaffRegister staff={staff} resignedStaff={resignedStaff} attendance={[]} payroll={[]} date="2026-09-02" month="2026-09" />);

    expect(screen.getByText("Resigned staff")).toBeInTheDocument();
    expect(screen.getByText(/Resigned · Left for another job/i)).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /mark resigned/i })).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: /reactivate/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/staff/staff-deepa/status", expect.objectContaining({ method: "PATCH" })));
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse((request as RequestInit).body as string)).toEqual({ active: true, reason: "Rejoined" });
  });
});
