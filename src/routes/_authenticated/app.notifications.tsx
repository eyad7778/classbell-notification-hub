import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Bell, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { Card, Empty, fmtDate, Loading, PageTitle } from "@/components/app-ui";
import { pageMeta } from "@/lib/meta";
import { usePreferences, useText } from "@/hooks/use-preferences";
import { getPushConfig, savePushSubscription, sendPushTestNotification } from "@/lib/push.functions";
import { getActivePushRegistration, subscribeWithKey } from "@/lib/push-client";
import { pushErrorMessage } from "@/lib/push-errors";

export const Route = createFileRoute("/_authenticated/app/notifications")({
  head: () => pageMeta("الإشعارات", "كل الإشعارات التي وصلتك."),
  component: Notifications,
});

function Notifications() {
  const me = useMe();
  const t = useText();
  const { language } = usePreferences();
  const qc = useQueryClient();
  const getConfig = useServerFn(getPushConfig);
  const saveSubscription = useServerFn(savePushSubscription);
  const sendTest = useServerFn(sendPushTestNotification);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushConnected, setPushConnected] = useState(false);
  const [pushMessage, setPushMessage] = useState("");
  const [pushError, setPushError] = useState("");
  const [notificationError, setNotificationError] = useState("");
  const q = useQuery({
    queryKey: ["notifications"],
    enabled: !!me.data,
    queryFn: async () => {
      const [n, r] = await Promise.all([
        supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("notification_reads").select("notification_id").eq("user_id", me.data!.id),
      ]);
      if (n.error || r.error) throw n.error ?? r.error;
      const read = new Set((r.data ?? []).map((x) => x.notification_id));
      return (n.data ?? []).map((x) => ({ ...x, read: read.has(x.id) }));
    },
  });
  async function markAll() {
    const unread = (q.data ?? []).filter((x) => !x.read);
    if (!unread.length || !me.data) return;
    setNotificationError("");
    const { error } = await supabase.from("notification_reads").upsert(unread.map((x) => ({ notification_id: x.id, user_id: me.data!.id })), { onConflict: "notification_id,user_id", ignoreDuplicates: true });
    if (error) {
      setNotificationError(t("تعذّر تحديث حالة الإشعارات.", "Could not update notification status."));
      return;
    }
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["unread"] });
  }

  async function markOne(notificationId: string) {
    if (!me.data) return;
    setNotificationError("");
    const { error } = await supabase.from("notification_reads").upsert(
      { notification_id: notificationId, user_id: me.data.id },
      { onConflict: "notification_id,user_id", ignoreDuplicates: true },
    );
    if (error) {
      setNotificationError(t("تعذّر تحديث حالة الإشعار.", "Could not update notification status."));
      return;
    }
    await qc.invalidateQueries({ queryKey: ["notifications"] });
    await qc.invalidateQueries({ queryKey: ["unread"] });
  }

  async function connectDevice() {
    setPushBusy(true);
    setPushError("");
    setPushMessage("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        throw new Error("PUSH_UNSUPPORTED");
      }
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") throw new Error("PUSH_PERMISSION_DENIED");

      const config = await getConfig();
      if (!config.publicKey) throw new Error("PUSH_NOT_CONFIGURED");
      const registration = await getActivePushRegistration();
      const subscription = await subscribeWithKey(registration, config.publicKey);
      const json = subscription.toJSON();
      if (!json.keys?.["p256dh"] || !json.keys["auth"]) throw new Error("Could not read the browser push keys.");
      await saveSubscription({ data: {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys["p256dh"], auth: json.keys["auth"] },
      } });
      setPushConnected(true);
      setPushMessage(t("تم ربط هذا الجهاز وحفظه بنجاح. جرّب إرسال إشعار للتأكد.", "This device is connected and saved. Send a test notification to check delivery."));
    } catch (error) {
      setPushConnected(false);
      setPushError(pushErrorMessage(error, language === "en"));
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTestNotification() {
    setPushBusy(true);
    setPushError("");
    setPushMessage("");
    try {
      await sendTest();
      setPushMessage(t("وصل الإشعار التجريبي لهذا الجهاز بنجاح 🎉", "The test notification reached this device 🎉"));
    } catch (error) {
      setPushError(pushErrorMessage(error, language === "en"));
    } finally {
      setPushBusy(false);
    }
  }
  if (q.isLoading || me.isLoading) return <Loading />;
  if (q.isError) return <p role="alert" className="text-sm text-destructive">{t("تعذّر تحميل الإشعارات. أعد تحميل الصفحة.", "Could not load notifications. Reload the page.")}</p>;
  const list = q.data ?? [];
  return (
    <div>
      <PageTitle title={t("الإشعارات", "Notifications")} action={list.some((x) => !x.read) && <Button variant="outline" size="sm" onClick={markAll}>{t("تعليم الكل كمقروء", "Mark all as read")}</Button>} />
      {notificationError && <p role="alert" className="mb-3 text-sm text-destructive">{notificationError}</p>}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">{t("إشعارات الموبايل", "Mobile notifications")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("اربط هذا الجهاز مرة واحدة، ثم أرسل إشعارًا تجريبيًا للتأكد من وصوله.", "Connect this device once, then send a test notification to verify delivery.")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={connectDevice} disabled={pushBusy}>
              {pushBusy ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
              {t("تفعيل / إعادة ربط الجهاز", "Enable / reconnect device")}
            </Button>
            {pushConnected && <Button type="button" onClick={sendTestNotification} disabled={pushBusy}>{t("إرسال إشعار تجريبي", "Send test notification")}</Button>}
          </div>
        </div>
        {pushMessage && <p role="status" className="mt-3 text-sm text-success">{pushMessage}</p>}
        {pushError && <p role="alert" className="mt-3 text-sm text-destructive">{pushError}</p>}
      </Card>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">{t("الإعلانات والأخبار", "Announcements and news")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("الإعلانات العامة منفصلة عن إشعارات حسابك الشخصية.", "Public announcements are separate from personal account notifications.")}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/app/announcements">{t("عرض الإعلانات", "View announcements")}</Link>
          </Button>
        </div>
      </Card>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">{t("إعدادات الإشعارات", "Notification settings")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {me.data?.tg
                ? t("حالة Telegram: مرتبط", "Telegram status: linked")
                : t("حالة Telegram: غير مرتبط. الربط اختياري ويمكنك إتمامه لاحقًا.", "Telegram status: not linked. Linking is optional and can be done later.")}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/app/telegram"><Send className="size-4" />{t(me.data?.tg ? "إدارة الربط" : "ربط Telegram اختياريًا", me.data?.tg ? "Manage link" : "Optionally link Telegram")}</Link>
          </Button>
        </div>
      </Card>
      {list.length === 0 ? <Empty title={t("لا توجد إشعارات", "No notifications yet")} /> : (
        <div className="space-y-2">
          {list.map((n) => (
            <Card key={n.id} className={n.read ? "opacity-70" : "border-primary"}>
              <div className="flex justify-between gap-2">
                <p className="font-bold">{!n.read && <span className="ms-0 me-2 inline-block size-2 rounded-full bg-primary" />}{n.title}</p>
                <span className="text-xs text-muted-foreground">{fmtDate(n.created_at, true)}</span>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm">{n.body}</p>
              {n.link?.startsWith("/app") && <Link to={n.link} className="mt-2 inline-block text-sm text-primary">{t("عرض", "Open")}</Link>}
              {!n.read && (
                <Button className="mt-2" size="sm" variant="outline" onClick={() => markOne(n.id)}>
                  {t("تعليم كمقروء", "Mark as read")}
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
