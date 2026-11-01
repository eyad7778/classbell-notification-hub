import { scheduleDatabase } from "@/lib/schedule-database";
import { deliverTelegram, escapeHtml } from "@/lib/telegram.server";
import { deliverPush } from "@/lib/push.server";

type Admin = typeof import("@/integrations/supabase/client.server")["supabaseAdmin"];
export async function deliverScheduleAlert(admin: Admin, changeId: string, ids: string[], alert: { title: string; body: string }, actor: string) {
  const db = scheduleDatabase(admin);
  const { data: change, error } = await admin.from("class_schedule_changes").select("*").eq("id", changeId).single();
  if (error || !change) throw new Error("تعذّر تحميل حالة التنبيه");
  let notificationId = change.notification_id;
  if (!notificationId) {
    const { data: notification, error: notificationError } = await admin.from("notifications").insert({
      ...alert, user_id: null, link: "/app/schedule", created_by: actor,
      target_department_ids: change.target_department_ids, target_levels: change.target_levels,
    }).select("id").single();
    if (notificationError || !notification) return { recipients: ids.length, sent: 0, failed: ids.length, deliveryError: true };
    notificationId = notification.id;
    const { error: trackError } = await admin.from("class_schedule_changes").update({ notification_id: notificationId }).eq("id", changeId);
    if (trackError) return { recipients: ids.length, sent: 0, failed: ids.length, deliveryError: true };
    await deliverPush(admin, ids, { ...alert, url: "/app/schedule" }).catch((e) => console.error("Schedule push failed", e));
  }
  let sent = 0, failed = 0;
  for (const userId of ids) {
    const { error: claimError } = await db.from("class_schedule_alert_deliveries").insert({ change_id: changeId, user_id: userId });
    if (claimError) {
      if (claimError.code !== "23505") { failed++; continue; }
      const { data: retry, error: retryError } = await db.from("class_schedule_alert_deliveries").update({ status: "processing" })
        .eq("change_id", changeId).eq("user_id", userId).eq("status", "failed").select("user_id");
      if (retryError || !retry?.length) continue;
    }
    let ok = false;
    try { ok = (await deliverTelegram(admin, [userId], `<b>${escapeHtml(alert.title)}</b>\n${escapeHtml(alert.body)}`, notificationId, null)).sent === 1; }
    catch (e) { console.error("Schedule Telegram failed", e); }
    const { error: statusError } = await db.from("class_schedule_alert_deliveries").update({ status: ok ? "sent" : "failed" })
      .eq("change_id", changeId).eq("user_id", userId);
    if (statusError) console.error("Schedule delivery tracking failed", { code: statusError.code });
    if (ok) sent++; else failed++;
  }
  const { data: deliveries } = await db.from("class_schedule_alert_deliveries").select("status").eq("change_id", changeId);
  const { error: trackingError } = await admin.from("class_schedule_changes").update({ recipients: ids.length,
    telegram_sent: deliveries?.filter((d) => d.status === "sent").length ?? sent,
    telegram_failed: deliveries?.filter((d) => d.status === "failed").length ?? failed,
  }).eq("id", changeId);
  if (trackingError) console.error("Schedule counts failed", { code: trackingError.code });
  return { recipients: ids.length, sent, failed, deliveryError: false };
}