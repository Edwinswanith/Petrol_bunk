import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExpenseForm } from "@/components/finance/expense-form";

afterEach(() => vi.unstubAllGlobals());

describe("ExpenseForm", () => {
  it("records a simple owner expense without an approval flow", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "expense-1" }) })
    );
    render(<ExpenseForm defaultDate="2026-08-31" />);

    await user.selectOptions(screen.getByLabelText(/category/i), "maintenance");
    await user.type(screen.getByLabelText(/^amount/i), "4500");
    await user.type(screen.getByLabelText(/note/i), "Dispenser hose replacement");
    await user.click(screen.getByRole("button", { name: /save expense/i }));

    expect(await screen.findByText("Expense recorded")).toBeInTheDocument();
    expect(screen.queryByText(/approval/i)).not.toBeInTheDocument();
  });
});
