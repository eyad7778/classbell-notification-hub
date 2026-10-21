import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/use-me";
import { useSettings } from "@/hooks/use-settings";
import { createTelegramLink } from "@/lib/student.functions";
import { Card, ErrorBox, fmtDate, Loading, PageTitle } from "@/components/app-ui";
import { useText } from "@/hooks/use-preferences";

export const Route = createFileRoute("/_authenticated/app/telegram")({
  head: () => ({
    meta: [
      { title: "ربط Telegram — Smart Student" },
      { name: "description", content: "اربط حسابك بـ Telegram لتصلك الإشعارات." },
      { property: "og:title", content: "ربط Telegram — Smart Student" },
      { property: "og:description", content: "استقبل إشعارات Smart Student على Telegram." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TelegramPage,
});

const sendLabel: Record<string, string> = { sent: "تم الإرسال", failed: "فشل الإرسال", blocked: "البوت محظور من طرفك" };

function TelegramPage() {
  const me = useMe();
  const t = useText();
  const settings = useSettings();
  const qc = useQueryClient();
  const create = useServerFn(createTelegramLink);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [opened, setOpened] = useState(false);

  if (me.isLoading) return <Loading />;
  if (!me.data) return <ErrorBox />;
  const { tg, status, isStaff } = me.data;

  async function link() {
    setErr("");
    setBusy(true);
    const r = await create().catch((error: unknown) => {
      console.error("Telegram link request failed", error);
      const message = error instanceof Error ? error.message : "";
      if (message.includes("SUPABASE_SERVICE_ROLE_KEY"))
        return { error: t("خدمة ربط Telegram غير مكتملة الإعداد على الخادم. تواصل مع الإدارة.", "Telegram linking is not configured on the server. Contact the administration.") };
      if (message.includes("TELEGRAM_API_KEY"))
        return { error: t("بوت Telegram غير مهيأ على الخادم. تواصل مع الإدارة.", "The Telegram bot is not configured on the server. Contact the administration.") };
      return { error: t("تعذّر الاتصال بالخادم. أعد المحاولة أو تواصل مع الإدارة.", "Could not reach the server. Try again or contact the administration.") };
    });
    setBusy(false);
    if ("error" in r && r.error) return setErr(r.error);
    if ("url" in r && r.url) {
      window.open(r.url, "_blank", "noopener");
      setOpened(true);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle title={t("ربط Telegram", "Connect Telegram")} subtitle={t("الربط إلزامي لتصلك إشعارات المحاضرات والإعلانات والامتحانات.", "Linking is required to receive lecture, announcement, and exam notifications.")} />
      {tg ? (
        <Card>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-8 text-success" />
            <div>
              <p className="font-bold">{t("حسابك مرتبط", "Your account is linked")}</p>
              <p className="text-sm text-muted-foreground">{t("منذ", "Since")} {fmtDate(tg.linked_at, true)}{tg.telegram_username ? ` · @${tg.telegram_username}` : ""}</p>
            </div>
          </div>
          {tg.last_send_status && (
            <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${tg.last_send_status === "sent" ? "bg-success-soft text-success" : "bg-destructive/10 text-destructive"}`}>
              {t("آخر إرسال:", "Last delivery:")} {t(sendLabel[tg.last_send_status] ?? tg.last_send_status, ({ sent: "Sent", failed: "Failed", blocked: "Bot blocked" } as Record<string, string>)[tg.last_send_status] ?? tg.last_send_status)} · {fmtDate(tg.last_send_at, true)}
            </p>
          )}
          {tg.blocked && <p className="mt-3 text-sm text-muted-foreground">{t("افتح البوت في Telegram واضغط «إلغاء الحظر» ثم Start لتعود الإشعارات.", "Open the Telegram bot, unblock it, then press Start to resume notifications.")}</p>}
          <Button variant="outline" className="mt-5" onClick={link} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {t("إعادة الربط بحساب آخر", "Link another account")}
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">{t("فصل الربط يتم عن طريق الإدارة فقط.", "Only an administrator can unlink your account.")}</p>
        </Card>
      ) : status !== "active" && !isStaff ? (
        <Card className="text-center">
          <p className="font-semibold">{t("فعّل اشتراكك أولًا", "Activate your subscription first")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("يظهر زر الربط بعد تفعيل الاشتراك من الإدارة.", "The linking button appears after the administration activates your subscription.")}</p>
          <Button asChild className="mt-4"><Link to="/app/subscription">{t("صفحة الاشتراك", "Subscription page")}</Link></Button>
        </Card>
      ) : (
        <Card>
          <ol className="space-y-3 text-sm leading-7">
            <li>1. {t("اضغط الزر بالأسفل ليفتح بوت المشروع في Telegram.", "Press the button below to open the Telegram bot.")}</li>
            <li>2. {t("اضغط", "Press")} <b>Start</b> {t("داخل المحادثة.", "in the chat.")}</li>
            <li>3. {t("ستصلك رسالة تأكيد، ثم ارجع هنا واضغط «تحديث الحالة».", "You will receive a confirmation. Return here and refresh the status.")}</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">{t("رابط الربط صالح لمدة 15 دقيقة ولمرة واحدة فقط.", "The link is valid once and expires after 15 minutes.")}</p>
          {err && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="lg" onClick={link} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {t("ربط حساب Telegram", "Link Telegram account")}</Button>
            {opened && <Button size="lg" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["me"] })}>{t("تحديث الحالة", "Refresh status")}</Button>}
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            {t("تواجه مشكلة؟ تواصل مع الدعم", "Need help? Contact support")}{settings.data?.support_telegram ? `: ${settings.data.support_telegram}` : settings.data?.support_phone ? `: ${settings.data.support_phone}` : "."}
          </p>
        </Card>
      )}
    </div>
  );
}
