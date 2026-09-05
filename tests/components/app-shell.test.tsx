import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("AppShell", () => {
  it("uses a fixed owner workspace without identity or outlet configuration", () => {
    render(<AppShell><div>Dashboard content</div></AppShell>);

    expect(screen.getByText("Owner workspace")).toBeInTheDocument();
    expect(screen.getByText("Operations storage")).toBeInTheDocument();
    expect(screen.queryByText("Edwin Swanith")).not.toBeInTheDocument();
    expect(screen.queryByText("Swanith Fuels")).not.toBeInTheDocument();
  });

  it("blurs a focused number input on mouse-wheel scroll so the wheel never silently changes its value", () => {
    render(<AppShell><input aria-label="Reseller purchase price" type="number" defaultValue="100" /></AppShell>);
    const input = screen.getByRole("spinbutton", { name: "Reseller purchase price" });

    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.wheel(input);

    expect(document.activeElement).not.toBe(input);
  });
});
