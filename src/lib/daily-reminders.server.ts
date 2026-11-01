import { cairoToday, type Change } from "@/lib/schedule-changes";
import { runDailyReminders } from "@/lib/daily-reminders";
import { scheduleDatabase } from "@/lib/schedule-database";

export async function sendDailyReminders() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = scheduleDatabase(supabaseAdmin);
  const { deliverTelegram, escapeHtml } = await import("@/lib/telegram.server");
  const date = cairoToday();
  const [schedule, changes] = await Promise.all([
    admin.from("class_schedule").select("*, subjects(name)"),
    admin.from("class_schedule_changes").select("*").lte("change_date", date).order("created_at"),
  ]);
  if (schedule.error || changes.error) throw new Error("تعذّر تحميل جدول التذكير؛ طبّق تحديث بيانات الجدول");
  const sessions = (schedule.data ?? []).map((s) => ({ ...s, subject: s.subjects?.name ?? "محاضرة" }));
  const rows = (changes.data ?? []).map((c) => ({ ...c, action: c.action as Change["action"], scope: c.scope as Change["scope"] }));
  let offset = 0;
  const counts = { sent: 0, failed: 0, skipped: 0 };
  while (true) {
    const { data: students, error } = await admin.rpc("schedule_reminder_recipients", { _offset: offset, _limit: 100 });
    if (error) throw new Error("تعذّر تحديد الطلاب المؤهلين للتذكير");
    if (!students?.length) break;
    const batch = await runDailyReminders(date, students, sessions, rows, {
      claim: async (userId, runDate) => {
        const { error: claimError } = await admin.from("class_reminder_deliveries").insert({ user_id: userId, run_date: runDate });
        if (!claimError) return true;
        if (claimError.code !== "23505") throw new Error("تعذّر حفظ حالة إرسال التذكير");
        const { data, error: retryError } = await admin.from("class_reminder_deliveries")
          .update({ status: "processing" }).eq("user_id", userId).eq("run_date", runDate).eq("status", "failed").select("user_id");
        if (retryError) throw new Error("تعذّر إعادة محاولة التذكير");
        return !!data?.length;
      },
      send: async (userId, text) => (await deliverTelegram(supabaseAdmin, [userId], escapeHtml(text), null, null)).sent === 1,
      finish: async (userId, runDate, status) => {
        const { error: finishError } = await admin.from("class_reminder_deliveries").update({ status }).eq("user_id", userId).eq("run_date", runDate);
        if (finishError) throw new Error("تعذّر تسجيل نتيجة التذكير");
      },
    });
    counts.sent += batch.sent; counts.failed += batch.failed; counts.skipped += batch.skipped;
    offset += students.length;
    if (students.length < 100) break;
  }
  return { date, ...counts };
}