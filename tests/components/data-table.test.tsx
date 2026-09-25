import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataTable } from "@/components/ui/data-table";

function Table({ rows }: { rows: string[] }) {
  return <DataTable><thead><tr><th>Pump</th><th>Litres</th></tr></thead><tbody>{rows.map((row) => <tr key={row}><td>{row}</td><td>10 L</td></tr>)}</tbody></DataTable>;
}

describe("DataTable", () => {
  it("labels each cell with its column heading for the mobile layout", () => {
    render(<Table rows={["Pump 1"]} />);

    expect(screen.getByRole("table")).toHaveClass("data-table");
    expect(screen.getByText("Pump 1")).toHaveAttribute("data-label", "Pump");
    expect(screen.getByText("10 L")).toHaveAttribute("data-label", "Litres");
  });

  it("labels rows that appear after the first render", async () => {
    const { rerender } = render(<Table rows={["Pump 1"]} />);
    rerender(<Table rows={["Pump 1", "Pump 2"]} />);

    await waitFor(() => expect(screen.getByText("Pump 2")).toHaveAttribute("data-label", "Pump"));
  });
});
