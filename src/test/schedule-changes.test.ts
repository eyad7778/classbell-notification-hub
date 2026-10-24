import { describe, expect, it } from "vitest";
import { buildChangeAlert, occurrencesOn, remindersOn, type Change, type Session } from "@/lib/schedule-changes";

const sunday: Session = { id: "s1", day_of_week: 0, starts_at: "09:00:00", ends_at: "11:00:00", location: "مدرج 16", instructor: "د. أحمد", subject: "الاقتصاد" };
const change = (c: Partial<Change>): Change => ({
  session_id: "s1", change_date: "2026-10-25", scope: "once", action: "cancel", new_date: null,
  new_starts_at: null, new_ends_at: null, new_location: null, new_instructor: null, reason: null,
  created_at: "2026-10-23T10:00:00Z", ...c,
});

describe("schedule changes", () => {
  it("cancelling one Sunday leaves the following Sunday as normal", () => {
    const changes = [change({})];
    expect(occurrencesOn("2026-10-25", [sunday], changes)[0]?.status).toBe("cancelled");
    expect(occurrencesOn("2026-11-01", [sunday], changes)[0]?.status).toBe("normal");
  });
  it("an 'all upcoming' change applies to later weeks too", () => {
    const changes = [change({ scope: "onwards", action: "location", new_location: "مدرج 10" })];
    expect(occurrencesOn("2026-11-01", [sunday], changes)[0]?.location).toBe("مدرج 10");
    expect(occurrencesOn("2026-10-18", [sunday], changes)[0]?.location).toBe("مدرج 16");
  });
  it("a cancelled lecture gets no daily reminder", () => {
    expect(remindersOn("2026-10-25", [sunday], [change({})])).toHaveLength(0);
  });
  it("a lecture postponed to Monday is reminded on Monday, not Sunday", () => {
    const changes = [change({ action: "postpone", new_date: "2026-10-26", new_starts_at: "12:00" })];
    expect(remindersOn("2026-10-25", [sunday], changes)).toHaveLength(0);
    const monday = remindersOn("2026-10-26", [sunday], changes);
    expect(monday).toHaveLength(1);
    expect(monday[0]?.startsAt).toBe("12:00");
  });
  it("restore brings the lecture back to its original state", () => {
    const changes = [change({}), change({ action: "restore", created_at: "2026-10-23T11:00:00Z" })];
    expect(occurrencesOn("2026-10-25", [sunday], changes)[0]?.status).toBe("normal");
  });
  it("postponing all future Sundays moves each one to its following Monday", () => {
    const changes = [change({ action: "postpone", scope: "onwards", new_date: "2026-10-26", new_starts_at: "12:00", new_ends_at: "14:00" })];
    expect(remindersOn("2026-11-01", [sunday], changes)).toHaveLength(0);
    expect(remindersOn("2026-11-02", [sunday], changes)[0]?.startsAt).toBe("12:00");
  });
  it("an occurrence postponed more than eight weeks is still shown at the new date", () => {
    const changes = [change({ action: "postpone", new_date: "2027-01-04" })];
    expect(remindersOn("2027-01-04", [sunday], changes)).toHaveLength(1);
  });
  it("cancellation alert names the subject, day and time", () => {
    const a = buildChangeAlert({ action: "cancel", subject: "الاقتصاد", date: "2026-10-25", startsAt: "09:00", location: null, scope: "once", reason: "اعتذار الدكتور" });
    expect(a.body).toContain("الأحد 2026-10-25 الساعة 09:00");
    expect(a.body).toContain("اعتذار الدكتور");
  });
});
