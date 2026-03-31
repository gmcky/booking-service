import { describe, expect, it } from "vitest";
import { calculatePagination } from "../../shared/utils/pagination.js";

describe("calculatePagination", () => {
  it("returns skip 10 and take 10 for page 2 and limit 10", () => {
    expect(calculatePagination(2, 10)).toEqual({ skip: 10, take: 10 });
  });

  it("clamps negative page to 1", () => {
    expect(calculatePagination(-5, 10)).toEqual({ skip: 0, take: 10 });
  });

  it("clamps zero page to 1", () => {
    expect(calculatePagination(0, 10)).toEqual({ skip: 0, take: 10 });
  });
});
