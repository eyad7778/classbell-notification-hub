import { describe, expect, it } from "vitest";
import { isValidEgyptPhone, normalizePhone, phoneToEmail } from "@/lib/auth";

describe("Phone authentication", () => {
  it("maps an Egyptian phone to the same internal email across input formats", () => {
    const local = normalizePhone("٠١٠١٢٣٤٥٦٧٨");
    const international = normalizePhone("+20 10 1234 5678");
    expect(local).toBe("01012345678");
    expect(international).toBe(local);
    expect(phoneToEmail(local)).toBe("01012345678@students.smartcampus.app");
  });

  it("rejects phone numbers that cannot be Egyptian mobile credentials", () => {
    expect(isValidEgyptPhone("01012345678")).toBe(true);
    expect(isValidEgyptPhone("01912345678")).toBe(false);
    expect(isValidEgyptPhone("0101234567")).toBe(false);
  });
});