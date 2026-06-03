import { describe, it, expect } from "vitest";
import { cellDisplay, isNull, isBlob, parseInputValue } from "../lib/cellCoerce";

describe("cellDisplay", () => {
  it("shows NULL for null", () => expect(cellDisplay(null)).toBe("NULL"));
  it("shows NULL for undefined", () => expect(cellDisplay(undefined)).toBe("NULL"));
  it("shows [BLOB] for blob objects", () => expect(cellDisplay({ __blob: "abc" })).toBe("[BLOB]"));
  it("stringifies numbers", () => expect(cellDisplay(42)).toBe("42"));
  it("stringifies strings", () => expect(cellDisplay("hello")).toBe("hello"));
});

describe("isNull", () => {
  it("returns true for null/undefined", () => {
    expect(isNull(null)).toBe(true);
    expect(isNull(undefined)).toBe(true);
  });
  it("returns false for 0 or empty string", () => {
    expect(isNull(0)).toBe(false);
    expect(isNull("")).toBe(false);
  });
});

describe("isBlob", () => {
  it("detects blob marker", () => expect(isBlob({ __blob: "xyz" })).toBe(true));
  it("rejects plain objects", () => expect(isBlob({ foo: "bar" })).toBe(false));
});

describe("parseInputValue", () => {
  it("parses int from INTEGER type", () => expect(parseInputValue("42", "INTEGER")).toBe(42));
  it("parses float from REAL type", () => expect(parseInputValue("3.14", "REAL")).toBeCloseTo(3.14));
  it("returns null for empty", () => expect(parseInputValue("", "TEXT")).toBeNull());
  it("returns null for 'null' string", () => expect(parseInputValue("null", "TEXT")).toBeNull());
  it("returns string for TEXT type", () => expect(parseInputValue("hello", "TEXT")).toBe("hello"));
});
