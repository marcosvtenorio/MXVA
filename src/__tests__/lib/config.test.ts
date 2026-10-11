import { describe, expect, it } from "vitest";
import { formatUsd } from "@/lib/config";

describe("formatUsd", () => {
  it("formats whole dollar prices without cents", () => {
    expect(formatUsd(2900)).toBe("$29");
  });

  it("keeps cents when present", () => {
    expect(formatUsd(1950)).toBe("$19.50");
  });
});
