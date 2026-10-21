import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Building2, GraduationCap, Hash, Loader2, Phone, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { statusLabel, useMe } from "@/hooks/use-me";
import { useSettings } from "@/hooks/use-settings";
import { Card, ErrorBox, fmtDate, Loading, PageTitle } from "@/components/app-ui";
import { useText } from "@/hooks/use-preferences";

export const Route = createFileRoute("/_authenticated/app/subscription")({
  head: () => ({
    meta: [
      { title: "حسابي — Smart Student" },
      { name: "description", content: "بياناتك الدراسية وحالة اشتراكك." },
      { property: "og:title", content: "حسابي — Smart Student" },
      { property: "og:description", content: "تابع بياناتك الدراسية واشتراكك في Smart Student." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Subscription,
});

const prLabel = { pending: "قيد المراجعة", approved: "مقبول", rejected: "مرفوض" } as const;

function Subscription() {
  const me = useMe();
  const t = useText();
  const settings = useSettings();
  const qc = useQueryClient();
  const requests = useQuery({
    queryKey: ["my-payments"],
    queryFn: async () => (await supabase.from("payment_requests").select("*").order("created_at", { ascending: false }).limit(10)).data ?? [],
  });
  const department = useQuery({
    queryKey: ["my-department", me.data?.profile?.department_id],
    enabled: !!me.data?.profile?.department_id,
    queryFn: async () => {
      const id = me.data?.profile?.department_id;
      if (!id) return null;
      const { data, error } = await supabase.from("departments").select("name").eq("id", id).maybeSingle();
      if (error) throw error;
      return data?.name ?? null;
    },
  });
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (me.isLoading || settings.isLoading) return <Loading />;
  if (!me.data || !settings.data) return <ErrorBox />;
  const s = settings.data;
  const userId = me.data.id;
  const st = statusLabel[me.data.status];
  const isActive = me.data.status === "active";
  const hasPending = (requests.data ?? []).some((r) => r.status === "pending");
  const canSubmit = !isActive && !hasPending && me.data.status !== "suspended";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!method) return setErr(t("اختر طريقة الدفع.", "Choose a payment method."));
    if (reference.trim().length < 3) return setErr(t("اكتب رقم العملية أو الرقم المحوَّل منه.", "Enter the transaction or sender reference."));
    if (!file) return setErr(t("ارفع صورة التحويل أو الإيصال.", "Upload a photo of the transfer receipt."));
    if (!( ["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type))
      return setErr(t("اختر صورة JPG أو PNG أو WEBP.", "Choose a JPG, PNG, or WEBP image."));
    if (file.size > 5 * 1024 * 1024) return setErr(t("حجم الإيصال يجب ألا يتجاوز 5 ميجابايت.", "The receipt must be 5 MB or smaller."));
    setBusy(true);
    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const receipt_path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const up = await supabase.storage.from("receipts").upload(receipt_path, file, { contentType: file.type, upsert: false });
    if (up.error) { setBusy(false); return setErr(t("تعذّر رفع الإيصال، حاول مرة أخرى.", "Could not upload the receipt. Try again.")); }
    const { error } = await supabase.from("payment_requests").insert({ user_id: userId, amount: s.subscription_price, method, reference: reference.trim(), receipt_path });
    setBusy(false);
    if (error) {
      await supabase.storage.from("receipts").remove([receipt_path]);
      return setErr(t("تعذّر إرسال الطلب، حاول مرة أخرى.", "Could not submit your request. Try again."));
    }
    toast.success(t("تم إرسال طلبك للمراجعة", "Your request was submitted for review"));
    setReference(""); setFile(null);
    qc.invalidateQueries();
  }

  return (
    <div>
      <PageTitle title={t("حسابي", "My account")} subtitle={t("بياناتك الدراسية واشتراكك في مكان واحد.", "Your study profile and subscription in one place.")} />
      <Card className="mb-4 overflow-hidden p-0">
        <div className="bg-gradient-to-l from-primary to-navy p-5 text-primary-foreground sm:p-7">
          <div className="flex items-center gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <UserRound className="size-7" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-white/75">{t("ملف الطالب", "Student profile")}</p>
              <h2 className="mt-1 truncate text-xl font-bold">{me.data.profile?.full_name || t("طالب Smart Student", "Smart Student")}</h2>
              <p className="mt-1 text-sm text-white/80">{t("بياناتك الدراسية وحسابك في مكان واحد", "Your study and account details in one place")}</p>
            </div>
          </div>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center gap-3 bg-card p-4">
            <Building2 className="size-5 shrink-0 text-primary" />
            <div className="min-w-0"><p className="text-xs text-muted-foreground">{t("التخصص / القسم", "Major / department")}</p><p className="truncate font-semibold">{department.isLoading ? t("جارٍ التحميل…", "Loading…") : department.data ?? t("غير محدد", "Not set")}</p></div>
          </div>
          <div className="flex items-center gap-3 bg-card p-4">
            <GraduationCap className="size-5 shrink-0 text-primary" />
            <div className="min-w-0"><p className="text-xs text-muted-foreground">{t("الفرقة الدراسية", "Study year")}</p><p className="truncate font-semibold">{me.data.profile?.level ?? t("غير محددة", "Not set")}</p></div>
          </div>
          <div className="flex items-center gap-3 bg-card p-4">
            <Hash className="size-5 shrink-0 text-primary" />
            <div className="min-w-0"><p className="text-xs text-muted-foreground">{t("كود الطالب", "Student ID")}</p><p className="truncate font-semibold" dir="auto">{me.data.profile?.student_code ?? "—"}</p></div>
          </div>
          <div className="flex items-center gap-3 bg-card p-4 sm:col-span-2 lg:col-span-3">
            <Phone className="size-5 shrink-0 text-primary" />
            <div className="min-w-0"><p className="text-xs text-muted-foreground">{t("رقم الهاتف", "Phone number")}</p><p className="font-semibold" dir="ltr">{me.data.profile?.phone ?? "—"}</p></div>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <p className="text-sm text-muted-foreground">{t("حالة اشتراكك", "Subscription status")}</p>
          <span className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-semibold ${st.cls}`}>{t(st.text, { pending: "Under review", awaiting_payment: "Awaiting payment", active: "Active", expired: "Expired", suspended: "Suspended", rejected: "Rejected" }[me.data.status])}</span>
          {me.data.sub?.end_at && <p className="mt-3 text-sm">{t("تاريخ الانتهاء:", "Ends:")} <b>{fmtDate(me.data.sub.end_at)}</b></p>}
          {me.data.status === "suspended" && <p className="mt-3 text-sm text-destructive">{t("اشتراكك موقوف. تواصل مع الإدارة.", "Your subscription is suspended. Contact the administration.")}</p>}
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">{t("سعر الاشتراك السنوي", "Annual subscription")}</p>
          <p className="mt-1 text-3xl font-extrabold text-navy">{s.subscription_price} <span className="text-base font-semibold">{s.currency}</span></p>
          <p className="mt-1 text-sm text-muted-foreground">{t("مدة الاشتراك: سنة واحدة", "Subscription period: one year")}</p>
        </Card>
      </div>

      {isActive ? (
        <p className="mt-4 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          {t("اشتراكك فعّال؛ لا تحتاج لإرسال بيانات دفع الآن.", "Your subscription is active. You do not need to submit payment details now.")}
        </p>
      ) : (
        <Card className="mt-4">
          <h2 className="font-bold">{t("طرق الدفع", "Payment methods")}</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {s.payment_methods.map((m) => (
              <li key={m.name} className="rounded-xl bg-muted px-4 py-3 text-sm"><b>{m.name}</b><span className="block text-muted-foreground" dir="auto">{m.details}</span></li>
            ))}
          </ul>
          <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted-foreground">{s.payment_instructions}</p>
        </Card>
      )}

      {!isActive && canSubmit ? (
        <Card className="mt-4">
          <h2 className="font-bold">{t("إرسال بيانات الدفع", "Submit payment details")}</h2>
          <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
            <div className="space-y-2">
              <Label htmlFor="method">{t("طريقة الدفع", "Payment method")}</Label>
              <select id="method" value={method} onChange={(e) => setMethod(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">{t("اختر…", "Choose…")}</option>
                {s.payment_methods.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ref">{t("رقم العملية / الرقم المحوَّل منه", "Transaction / sender reference")}</Label>
              <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} dir="auto" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="receipt">{t("صورة التحويل أو الإيصال", "Transfer receipt image")}</Label>
              <Input id="receipt" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
            </div>
            {err && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2">{err}</p>}
            <Button type="submit" disabled={busy} className="sm:col-span-2">{busy && <Loader2 className="size-4 animate-spin" />} {t("إرسال للمراجعة", "Submit for review")}</Button>
          </form>
        </Card>
      ) : !isActive && hasPending && (
        <p className="mt-4 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">{t("لديك طلب قيد المراجعة. سيصلك إشعار عند البت فيه.", "You have a request under review. You will be notified when it is processed.")}</p>
      )}

      {!isActive && (requests.data ?? []).length > 0 && (
        <Card className="mt-4">
          <h2 className="font-bold">{t("طلباتك السابقة", "Previous requests")}</h2>
          <ul className="mt-3 divide-y text-sm">
            {requests.data!.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-3">
                <span>{r.method} · {r.amount} · <span dir="auto">{r.reference}</span></span>
                <span className="text-muted-foreground">{t(prLabel[r.status], r.status === "pending" ? "Under review" : r.status === "approved" ? "Approved" : "Rejected")} · {fmtDate(r.created_at)}</span>
                {r.review_note && <span className="w-full text-xs text-muted-foreground">{t("ملاحظة الإدارة:", "Administration note:")} {r.review_note}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
