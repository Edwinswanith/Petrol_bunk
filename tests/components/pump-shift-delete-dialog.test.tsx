import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PumpShiftDeleteDialog } from "@/components/finance/pump-shift-delete-dialog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
});

const entry = {
  id: "dummy-entry", shiftId: "shift-1", pumpId: "pump-a", pumpLabel: "Pump A", staffName: "Dummy Operator",
  businessDate: "2026-09-24", shiftStartTime: "06:00", shiftEndTime: "08:00", litresSold: "12.000", expectedSalesValue: "1200.00"
};

describe("PumpShiftDeleteDialog", () => {
  it("explains the impact and requires a reason before deletion", async () => {
    const user = userEvent.setup();
    render(<PumpShiftDeleteDialog entry={entry} onDeleted={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Delete Dummy Operator's Pump A entry" }));
    expect(screen.getByRole("heading", { name: "Delete today’s entry?" })).toBeInTheDocument();
    expect(screen.getByText(/12.000 L/)).toBeInTheDocument();
    expect(screen.getByText(/previous business dates will not change/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete entry" })).toBeDisabled();
  });

  it("deletes the entry and returns the updated shift", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const updatedShift = { id: "shift-1", pumpShiftHistory: [] };
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => updatedShift }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PumpShiftDeleteDialog entry={entry} onDeleted={onDeleted} />);

    await user.click(screen.getByRole("button", { name: "Delete Dummy Operator's Pump A entry" }));
    await user.type(screen.getByLabelText("Reason for deleting this entry"), "Dummy verification entry");
    await user.click(screen.getByRole("button", { name: "Delete entry" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(updatedShift));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shifts/shift-1/pumps/pump-a/history/dummy-entry",
      expect.objectContaining({ method: "DELETE", body: JSON.stringify({ reason: "Dummy verification entry" }) })
    );
  });

  it("keeps the dialog open and shows a server-side safety error", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: "Only entries from today's open business date can be deleted" }) })));
    render(<PumpShiftDeleteDialog entry={entry} onDeleted={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Delete Dummy Operator's Pump A entry" }));
    await user.type(screen.getByLabelText("Reason for deleting this entry"), "Wrong record");
    await user.click(screen.getByRole("button", { name: "Delete entry" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Only entries from today's open business date can be deleted");
  });
});
