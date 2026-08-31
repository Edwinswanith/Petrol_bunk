import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OwnerDashboard } from "@/components/dashboard/owner-dashboard";
import { demoDashboard } from "@/server/demo/demo-data";

describe("OwnerDashboard", () => {
  it("shows the business position and current shift", () => {
    render(<OwnerDashboard dashboard={demoDashboard} />);

    expect(screen.getByRole("heading", { name: /good evening/i })).toBeInTheDocument();
    expect(screen.getByText("Enter and review today’s forecourt operations.")).toBeInTheDocument();
    expect(screen.queryByText("Edwin")).not.toBeInTheDocument();
    expect(screen.queryByText("Swanith Fuels")).not.toBeInTheDocument();
    expect(screen.getByText("₹5,42,850")).toBeInTheDocument();
    expect(screen.getByText("Evening shift")).toBeInTheDocument();
    expect(screen.getByText("Diesel stock is nearing reorder level")).toBeInTheDocument();
  });

  it("exposes the primary owner actions as links", () => {
    render(<OwnerDashboard dashboard={demoDashboard} />);

    expect(screen.getByRole("link", { name: /continue shift/i })).toHaveAttribute(
      "href",
      "/shifts/shift-live-001"
    );
    expect(screen.getByRole("link", { name: /record expense/i })).toHaveAttribute(
      "href",
      "/finance/expenses/new"
    );
  });
});
