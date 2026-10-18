import { describe, expect, it } from "vitest";
import { classifyPushStorageError } from "@/lib/push-errors";

describe("push storage failure classification", () => {
  it("identifies the observed unregistered service credential", () => {
    expect(classifyPushStorageError({ status: 401, message: "Unregistered API key" }))
      .toBe("PUSH_STORAGE_CREDENTIALS_INVALID");
  });
  it("identifies a missing push table", () => {
    expect(classifyPushStorageError({ code: "PGRST205" })).toBe("PUSH_STORAGE_NOT_READY");
  });
  it("does not mistake a storage outage for an invalid credential", () => {
    expect(classifyPushStorageError({ status: 503 })).toBe("PUSH_STORAGE_FAILED");
  });
});