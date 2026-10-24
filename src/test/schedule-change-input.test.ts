import { describe, expect, it } from "vitest";
import { scheduleChangeInput } from "@/lib/schedule-change-input";
const base = { sessionId: "123e4567-e89b-12d3-a456-426614174000", date: "2026-10-25", action: "cancel" };
describe("schedule change validation", () => {
  it("rejects a nonexistent calendar date", () => expect(scheduleChangeInput.safeParse({ ...base, date: "2026-02-30" }).success).toBe(false));
  it("requires end time after start time", () => expect(scheduleChangeInput.safeParse({ ...base, action: "time", newStartsAt: "12:00", newEndsAt: "11:00" }).success).toBe(false));
  it("allows postponing all upcoming occurrences", () => expect(scheduleChangeInput.safeParse({ ...base, action: "postpone", scope: "onwards", newDate: "2026-10-26", newStartsAt: "12:00", newEndsAt: "14:00" }).success).toBe(true));
});