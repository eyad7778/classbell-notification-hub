export const URGENT_ACTIONS = [
  { id: "cancel", label: "إلغاء المحاضرة" },
  { id: "time", label: "تغيير الموعد" },
  { id: "location", label: "تغيير المكان" },
  { id: "instructor", label: "تغيير المحاضر" },
  { id: "note", label: "تنبيه آخر" },
] as const;

export type UrgentAction = (typeof URGENT_ACTIONS)[number]["id"];

export const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export type UrgentAlertInput = {
  action: UrgentAction;
  subject: string;
  date: string; // YYYY-MM-DD
  startsAt: string; // HH:MM
  location: string | null;
  newValue?: string | undefined;
  note?: string | undefined;
};

function dayLabel(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()]} ${date}`;
}

/** Builds the title/body of an urgent class alert. */
export function buildUrgentAlert(i: UrgentAlertInput): { title: string; body: string } {
  const when = `${dayLabel(i.date)} الساعة ${i.startsAt.slice(0, 5)}`;
  const extra = i.note?.trim() ? `\n📝 ${i.note.trim()}` : "";
  const newValue = i.newValue?.trim() ?? "";
  switch (i.action) {
    case "cancel":
      return { title: `🔴 عاجل — إلغاء محاضرة ${i.subject}`, body: `تم إلغاء محاضرة ${i.subject} المقررة يوم ${when}.${extra}` };
    case "time":
      return { title: `🟡 عاجل — تغيير موعد ${i.subject}`, body: `تغيّر موعد محاضرة ${i.subject} (${when}).\n🕛 الموعد الجديد: ${newValue}${i.location ? `\n📍 المكان: ${i.location}` : ""}${extra}` };
    case "location":
      return { title: `🔵 عاجل — تغيير مكان ${i.subject}`, body: `تم نقل محاضرة ${i.subject} (${when})${i.location ? ` من ${i.location}` : ""} إلى ${newValue}.${extra}` };
    case "instructor":
      return { title: `🟣 عاجل — تغيير محاضر ${i.subject}`, body: `محاضرة ${i.subject} (${when}) سيقدمها: ${newValue}.${extra}` };
    default:
      return { title: `⚠️ تنبيه عاجل — ${i.subject}`, body: `بخصوص محاضرة ${i.subject} (${when}):${extra || " يرجى متابعة الجدول."}` };
  }
}

/** Next calendar date (YYYY-MM-DD, local) matching a weekday, today included. */
export function nextDateForDay(dayOfWeek: number, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + ((dayOfWeek - d.getDay() + 7) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
