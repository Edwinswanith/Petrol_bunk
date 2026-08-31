import { render, screen } from "@testing-library/react";
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
});
