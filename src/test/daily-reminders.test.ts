import { describe, expect, it, vi } from "vitest";
import { remindersForStudent, runDailyReminders, type TargetedSession } from "@/lib/daily-reminders";
import type { Change } from "@/lib/schedule-changes";

const student = { user_id: "student1", department_id: "business", level: "الفرقة الأولى" };
const session: TargetedSession = { id: "s1", day_of_week: 0, starts_at: "10:00", ends_at: "12:00", subject: "الاقتصاد", location: null, instructor: null, target_department_ids: ["business"], target_levels: ["الفرقة الأولى"] };
const cancellation: Change = { session_id: "s1", change_date: "2026-11-01", scope: "once", action: "cancel", new_date: null, new_starts_at: null, new_ends_at: null, new_location: null, new_instructor: null, reason: null, created_at: "2026-11-01T06:00:00Z" };

describe("daily reminders", () => {
  it("does not remind a student about the 10am class cancelled at 8am Cairo", async () => {
    const send = vi.fn();
    const result = await runDailyReminders("2026-11-01", [student], [session], [cancellation], { claim: vi.fn(), send, finish: vi.fn() });
    expect(send).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });
  it("does not include another department's class", () => {
    expect(remindersForStudent("2026-11-01", { ...student, department_id: "other" }, [session], [])).toHaveLength(0);
  });
  it("does not include another academic year's class", () => {
    expect(remindersForStudent("2026-11-01", { ...student, level: "الفرقة الثانية" }, [session], [])).toHaveLength(0);
  });
  it("sends the postponed class on Monday instead of Sunday", () => {
    const postponed: Change = { ...cancellation, action: "postpone", new_date: "2026-11-02", new_starts_at: "12:00", new_ends_at: "14:00" };
    expect(remindersForStudent("2026-11-01", student, [session], [postponed])).toHaveLength(0);
    expect(remindersForStudent("2026-11-02", student, [session], [postponed])[0]?.startsAt).toBe("12:00");
  });
  it("does not send a second reminder after a date has already been claimed", async () => {
    const send = vi.fn();
    await runDailyReminders("2026-11-01", [student], [session], [], { claim: async () => false, send, finish: vi.fn() });
    expect(send).not.toHaveBeenCalled();
  });
  it("records rejected delivery as failed for a future retry", async () => {
    const finish = vi.fn();
    const result = await runDailyReminders("2026-11-01", [student], [session], [], { claim: async () => true, send: async () => false, finish });
    expect(result.failed).toBe(1);
    expect(finish).toHaveBeenCalledWith("student1", "2026-11-01", "failed");
  });
});