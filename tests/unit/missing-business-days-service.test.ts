import { describe, expect, it } from "vitest";

import { findMissingBusinessDays } from "@/server/services/missing-business-days-service";

describe("findMissingBusinessDays", () => {
  it("returns nothing when there is no closed day yet to measure a gap from", () => {
    expect(findMissingBusinessDays([], "2026-09-05")).toEqual([]);
    expect(findMissingBusinessDays([{ state: "OPEN", businessDate: "2026-09-02" }], "2026-09-05")).toEqual([]);
  });

  it("returns nothing when the last closed day was yesterday", () => {
    expect(findMissingBusinessDays([{ state: "CLOSED", businessDate: "2026-09-04" }], "2026-09-05")).toEqual([]);
  });

  it("lists every unrecorded date strictly between the last closed day and today", () => {
    expect(findMissingBusinessDays([{ state: "CLOSED", businessDate: "2026-09-01" }], "2026-09-05")).toEqual([
      "2026-09-02", "2026-09-03", "2026-09-04"
    ]);
  });

  it("never includes today itself, even though it has no record", () => {
    const missing = findMissingBusinessDays([{ state: "CLOSED", businessDate: "2026-09-04" }], "2026-09-05");
    expect(missing).not.toContain("2026-09-05");
  });

  it("excludes a gap date that already has a shift record, open or closed", () => {
    expect(findMissingBusinessDays([
      { state: "CLOSED", businessDate: "2026-09-01" },
      { state: "OPEN", businessDate: "2026-09-03" }
    ], "2026-09-05")).toEqual(["2026-09-02", "2026-09-04"]);
  });

  it("measures the gap from the most recently closed day, not the oldest one", () => {
    expect(findMissingBusinessDays([
      { state: "CLOSED", businessDate: "2026-08-20" },
      { state: "CLOSED", businessDate: "2026-09-03" }
    ], "2026-09-05")).toEqual(["2026-09-04"]);
  });
});
