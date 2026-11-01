import { remindersOn, type Change, type Session } from "@/lib/schedule-changes";

export type ReminderRecipient = { user_id: string; department_id: string | null; level: string | null };
export type TargetedSession = Session & { target_department_ids: string[]; target_levels: string[] };

export function remindersForStudent(date: string, student: ReminderRecipient, sessions: TargetedSession[], changes: Change[]) {
  return remindersOn(date, sessions.filter((s) =>
    (s.target_department_ids.length === 0 || (student.department_id !== null && s.target_department_ids.includes(student.department_id))) &&
    (s.target_levels.length === 0 || (student.level !== null && s.target_levels.includes(student.level))),
  ), changes);
}

export function reminderMessage(date: string, lessons: ReturnType<typeof remindersOn>) {
  return [`🔔 محاضراتك اليوم — ${date}`, ...lessons.map((s) =>
    `📚 ${s.subject}\n🕘 ${s.startsAt} – ${s.endsAt}${s.location ? `\n📍 ${s.location}` : ""}${s.instructor ? `\n👤 ${s.instructor}` : ""}`,
  )].join("\n\n");
}

export type ReminderDependencies = {
  claim: (userId: string, date: string) => Promise<boolean>;
  send: (userId: string, text: string) => Promise<boolean>;
  finish: (userId: string, date: string, status: "sent" | "failed") => Promise<void>;
};

export async function runDailyReminders(date: string, students: ReminderRecipient[], sessions: TargetedSession[], changes: Change[], deps: ReminderDependencies) {
  const counts = { sent: 0, failed: 0, skipped: 0 };
  let cursor = 0;
  async function worker() {
    while (cursor < students.length) {
      const student = students[cursor++];
      if (!student) continue;
      const lessons = remindersForStudent(date, student, sessions, changes);
      if (!lessons.length || !await deps.claim(student.user_id, date)) { counts.skipped++; continue; }
      let sent = false;
      try { sent = await deps.send(student.user_id, reminderMessage(date, lessons)); }
      catch { sent = false; }
      await deps.finish(student.user_id, date, sent ? "sent" : "failed");
      if (sent) counts.sent++; else counts.failed++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, students.length) }, worker));
  return counts;
}