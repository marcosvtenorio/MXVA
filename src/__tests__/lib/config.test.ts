import { describe, expect, it } from "vitest";
import { formatPrice, formatUsd } from "@/lib/config";

describe("formatUsd", () => {
  it("formats whole dollar prices without cents", () => {
    expect(formatUsd(2900)).toBe("$29");
  });

  it("keeps cents when present", () => {
    expect(formatUsd(1950)).toBe("$19.50");
  });
});

describe("formatPrice", () => {
  it("formats Pix prices in Brazilian notation", () => {
    expect(formatPrice(3799, "brl")).toBe("R$ 37,99");
  });

  it("formats card prices in dollars", () => {
    expect(formatPrice(2900, "usd")).toBe("$29");
  });
});
