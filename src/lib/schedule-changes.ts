export type ChangeAction = "cancel" | "postpone" | "time" | "location" | "instructor" | "restore" | "note";

export const CHANGE_ACTIONS: { id: ChangeAction; label: string }[] = [
  { id: "cancel", label: "إلغاء" },
  { id: "postpone", label: "تأجيل" },
  { id: "time", label: "تغيير التوقيت" },
  { id: "location", label: "تغيير المكان" },
  { id: "instructor", label: "تغيير المحاضر" },
  { id: "restore", label: "إعادة للموعد الأصلي" },
  { id: "note", label: "تنبيه آخر" },
];

export const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export type Session = {
  id: string;
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  location: string | null;
  instructor: string | null;
  subject: string;
};

export type Change = {
  session_id: string;
  change_date: string;
  scope: "once" | "onwards";
  action: ChangeAction;
  new_date: string | null;
  new_starts_at: string | null;
  new_ends_at: string | null;
  new_location: string | null;
  new_instructor: string | null;
  reason: string | null;
  created_at: string;
};

export type Occurrence = {
  sessionId: string;
  subject: string;
  date: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  instructor: string | null;
  status: "normal" | "cancelled" | "postponed" | "moved_here" | "changed";
  movedTo?: string | null;
  reason?: string | null;
};

export function weekdayOf(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Local calendar date (YYYY-MM-DD) in Cairo. */
export function cairoToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(now);
}

/** Next date on/after `from` that falls on the weekday. */
export function nextDateForDay(dayOfWeek: number, from: string) {
  return addDays(from, (dayOfWeek - weekdayOf(from) + 7) % 7);
}

function applies(c: Change, date: string) {
  return c.scope === "once" ? c.change_date === date : c.change_date <= date;
}

/** The session's state on its regular weekly date, after applying every change in creation order. */
function resolveRegular(session: Session, changes: Change[], date: string): Occurrence {
  const base: Occurrence = {
    sessionId: session.id, subject: session.subject, date,
    startsAt: session.starts_at.slice(0, 5), endsAt: session.ends_at.slice(0, 5),
    location: session.location, instructor: session.instructor, status: "normal",
  };
  let o = { ...base };
  for (const c of changes) {
    if (c.session_id !== session.id || !applies(c, date)) continue;
    if (c.action === "restore") { o = { ...base }; continue; }
    if (c.action === "note") continue;
    o.reason = c.reason;
    if (c.action === "cancel") { o.status = "cancelled"; o.movedTo = null; }
    else if (c.action === "postpone") { o.status = "postponed"; o.movedTo = c.new_date; if (c.new_starts_at) o.startsAt = c.new_starts_at.slice(0, 5); if (c.new_ends_at) o.endsAt = c.new_ends_at.slice(0, 5); }
    else {
      if (o.status === "normal") o.status = "changed";
      if (c.action === "time") { if (c.new_starts_at) o.startsAt = c.new_starts_at.slice(0, 5); if (c.new_ends_at) o.endsAt = c.new_ends_at.slice(0, 5); }
      if (c.action === "location") o.location = c.new_location;
      if (c.action === "instructor") o.instructor = c.new_instructor;
    }
  }
  return o;
}

/** All occurrences on a date: regular sessions (with any change applied) plus lectures postponed into this date. */
export function occurrencesOn(date: string, sessions: Session[], changes: Change[]): Occurrence[] {
  const sorted = [...changes].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const list: Occurrence[] = sessions.filter((s) => s.day_of_week === weekdayOf(date)).map((s) => resolveRegular(s, sorted, date));
  for (const s of sessions) {
    // Look back up to 8 weeks for a regular date postponed into `date`.
    for (let w = 0; w <= 8 * 7; w += 1) {
      const original = addDays(date, -w);
      if (weekdayOf(original) !== s.day_of_week) continue;
      const o = resolveRegular(s, sorted, original);
      if (o.status === "postponed" && o.movedTo === date && original !== date) {
        list.push({ ...o, date, status: "moved_here", movedTo: original });
      }
    }
  }
  return list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Lectures a student should be reminded about on a date (cancelled/postponed-away ones excluded). */
export function remindersOn(date: string, sessions: Session[], changes: Change[]) {
  return occurrencesOn(date, sessions, changes).filter((o) => o.status !== "cancelled" && o.status !== "postponed");
}

export type ChangeInput = {
  action: ChangeAction;
  subject: string;
  date: string;
  startsAt: string;
  location: string | null;
  newDate?: string | undefined;
  newStartsAt?: string | undefined;
  newEndsAt?: string | undefined;
  newLocation?: string | undefined;
  newInstructor?: string | undefined;
  reason?: string | undefined;
  scope: "once" | "onwards";
};

function dayLabel(date: string) {
  return `${DAY_NAMES[weekdayOf(date)]} ${date}`;
}

/** Title/body of the student alert for a schedule change. */
export function buildChangeAlert(i: ChangeInput): { title: string; body: string } {
  const when = `${dayLabel(i.date)} الساعة ${i.startsAt.slice(0, 5)}`;
  const scope = i.scope === "onwards" ? "\n🔁 يسري على كل المحاضرات القادمة من نفس الموعد." : "";
  const reason = i.reason?.trim() ? `\n📝 السبب: ${i.reason.trim()}` : "";
  const tail = `${scope}${reason}\nيرجى متابعة الجدول لمعرفة أي تحديثات جديدة.`;
  const s = i.subject;
  switch (i.action) {
    case "cancel":
      return { title: `🔴 تنبيه مهم — إلغاء محاضرة ${s}`, body: `تم إلغاء محاضرة ${s} المقررة يوم ${when}.${tail}` };
    case "postpone":
      return { title: `🟡 تنبيه — تأجيل محاضرة ${s}`, body: `تم تأجيل محاضرة ${s}.\n🕘 الموعد السابق: ${when}\n🕛 الموعد الجديد: ${i.newDate ? dayLabel(i.newDate) : ""}${i.newStartsAt ? ` الساعة ${i.newStartsAt}` : ""}${i.location ? `\n📍 المكان: ${i.location}` : ""}${tail}` };
    case "time":
      return { title: `🟡 تنبيه — تغيير موعد محاضرة ${s}`, body: `تم تغيير موعد محاضرة ${s}.\n🕘 الموعد السابق: ${when}\n🕛 الموعد الجديد: ${DAY_NAMES[weekdayOf(i.date)]} ${i.newStartsAt ?? ""}${i.newEndsAt ? ` – ${i.newEndsAt}` : ""}${i.location ? `\n📍 المكان: ${i.location}` : ""}${tail}` };
    case "location":
      return { title: `🔵 تنبيه — تغيير مكان محاضرة ${s}`, body: `تم نقل محاضرة ${s}${i.location ? ` من ${i.location}` : ""} إلى ${i.newLocation ?? ""}.\n📅 ${when}${tail}` };
    case "instructor":
      return { title: `🟣 تنبيه — تغيير محاضر ${s}`, body: `محاضرة ${s} يوم ${when} سيقدمها: ${i.newInstructor ?? ""}.${tail}` };
    case "restore":
      return { title: `🟢 تنبيه — عودة محاضرة ${s} لموعدها`, body: `محاضرة ${s} يوم ${when} عادت لموعدها ومكانها الأصلي.${tail}` };
    default:
      return { title: `⚠️ تنبيه عاجل — ${s}`, body: `بخصوص محاضرة ${s} يوم ${when}.${tail}` };
  }
}

export function changeDedupeKey(sessionId: string, i: Omit<ChangeInput, "subject" | "startsAt" | "location">) {
  return [sessionId, i.date, i.scope, i.action, i.newDate, i.newStartsAt, i.newEndsAt, i.newLocation?.trim(), i.newInstructor?.trim(), i.reason?.trim()].map((v) => v ?? "").join("|");
}
