import { describe, expect, it } from "vitest";
import { buildUrgentAlert, nextDateForDay } from "@/lib/urgent-alert";

describe("urgent class alert", () => {
  it("cancellation names the subject, day and time", () => {
    const a = buildUrgentAlert({ action: "cancel", subject: "الاقتصاد", date: "2026-10-25", startsAt: "10:00:00", location: null });
    expect(a.title).toContain("إلغاء");
    expect(a.body).toContain("الأحد 2026-10-25 الساعة 10:00");
  });
  it("picks the next date for the class weekday", () => {
    expect(nextDateForDay(0, new Date(2026, 9, 23))).toBe("2026-10-25");
  });
});
