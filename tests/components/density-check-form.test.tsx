import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DensityCheckForm } from "@/components/stock/density-check-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

afterEach(() => vi.unstubAllGlobals());

describe("DensityCheckForm", () => {
  it("records a tank quality check", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "density-1" })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DensityCheckForm defaultDate="2026-08-31" />);
    await user.type(screen.getByLabelText(/temperature/i), "29");
    await user.type(screen.getByLabelText(/^density/i), "742.5");
    await user.type(screen.getByLabelText(/water dip/i), "0");
    await user.click(screen.getByRole("button", { name: /save quality check/i }));

    expect(await screen.findByText("Quality check recorded")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
