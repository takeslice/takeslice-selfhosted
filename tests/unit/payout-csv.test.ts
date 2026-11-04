import { describe, expect, it } from "vitest";
import { csvCell, minorToDecimal, toCsv } from "@/features/payouts/csv";

describe("csvCell", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  });

  it("neutralises spreadsheet formulas typed by an affiliate", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+1 555")).toBe("'+1 555");
    expect(csvCell("@sum")).toBe("'@sum");
  });

  it("renders nullish values as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("minorToDecimal", () => {
  it("formats two-decimal currencies", () => {
    expect(minorToDecimal(12345, "EUR")).toBe("123.45");
    expect(minorToDecimal(5, "USD")).toBe("0.05");
    expect(minorToDecimal(-250, "GBP")).toBe("-2.50");
  });
});

describe("toCsv", () => {
  it("joins header and rows with CRLF", () => {
    expect(toCsv(["a", "b"], [["1", 2]])).toBe("a,b\r\n1,2\r\n");
  });
});
