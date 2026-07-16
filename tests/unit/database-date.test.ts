import { describe, expect, it } from "vitest";
import { parseDatabaseTimestamp } from "@/modules/suppliers/core/database-date";

describe("parseDatabaseTimestamp", () => {
  it("parses PostgreSQL timestamp strings", () => {
    expect(
      parseDatabaseTimestamp("2026-07-16T14:55:09.000Z")?.toISOString(),
    ).toBe("2026-07-16T14:55:09.000Z");
  });

  it("keeps Date values", () => {
    const value = new Date("2026-07-16T14:55:09.000Z");

    expect(parseDatabaseTimestamp(value)).toBe(value);
  });

  it("returns null for a missing aggregate result", () => {
    expect(parseDatabaseTimestamp(null)).toBeNull();
    expect(parseDatabaseTimestamp(undefined)).toBeNull();
  });

  it("rejects invalid timestamp values", () => {
    expect(() => parseDatabaseTimestamp("not-a-date")).toThrow(
      "유효하지 않은 데이터베이스 시간 값입니다.",
    );
    expect(() => parseDatabaseTimestamp(123)).toThrow(
      "유효하지 않은 데이터베이스 시간 값입니다.",
    );
  });
});
