import { describe, expect, it } from "vitest";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem } from "@/features/auth/password";

describe("passwordProblem", () => {
  it("accepts a password with letters, a number and enough length", () => {
    expect(passwordProblem("correct-horse-1")).toBeNull();
  });

  it("requires a minimum length", () => {
    expect(passwordProblem("short1")).toMatch(new RegExp(String(MIN_PASSWORD_LENGTH)));
  });

  it("requires a letter and a number", () => {
    expect(passwordProblem("1234567890")).not.toBeNull();
    expect(passwordProblem("abcdefghij")).not.toBeNull();
  });

  it("rejects passwords beyond the maximum length", () => {
    expect(passwordProblem(`${"a".repeat(MAX_PASSWORD_LENGTH)}1`)).not.toBeNull();
  });
});
