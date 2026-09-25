"use client";

import { useEffect, useRef, type TableHTMLAttributes } from "react";

function labelCells(table: HTMLTableElement) {
  const labels = [...table.querySelectorAll("thead th")].map((heading) => heading.textContent?.trim() ?? "");
  table.querySelectorAll("tbody tr").forEach((row) => {
    [...row.children].forEach((cell, index) => {
      if (cell instanceof HTMLTableCellElement && labels[index] && cell.dataset.label !== labels[index]) cell.dataset.label = labels[index];
    });
  });
}

/**
 * A `.data-table` whose cells carry their column heading as `data-label` for the stacked mobile layout.
 * Labels are applied from this component's own effect, so the table is already hydrated when they are added,
 * and re-applied whenever rows change (for example after router.refresh()).
 */
export function DataTable({ className, children, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  const ref = useRef<HTMLTableElement>(null);

  useEffect(() => {
    const table = ref.current;
    if (!table) return;
    labelCells(table);
    const observer = new MutationObserver(() => labelCells(table));
    observer.observe(table, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return <table className={className ? `data-table ${className}` : "data-table"} ref={ref} {...props}>{children}</table>;
}
