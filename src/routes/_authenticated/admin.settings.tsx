import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { useSettings, type PaymentMethod } from "@/hooks/use-settings";
import { Card, ErrorBox, Loading, PageTitle } from "@/components/app-ui";
import { pageMeta } from "@/lib/meta";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => pageMeta("إعدادات المنصة", "السعر والمدة وطرق الدفع وبيانات التواصل."),
  component: SettingsPage,
});

const fields = [
  ["subscription_price", "سعر الاشتراك", "number"], ["currency", "العملة", "text"],
  ["support_phone", "هاتف الدعم", "text"], ["support_telegram", "Telegram الدعم", "text"], ["support_email", "بريد الدعم", "text"],
  ["designer_name", "اسم المصمم", "text"], ["designer_contact", "تواصل المصمم", "text"],
] as const;

function SettingsPage() {
  const me = useMe();
  const settings = useSettings();
  const qc = useQueryClient();
  const [f, setF] = useState<Record<string, string>>({});
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = settings.data;
    if (!s) return;
    setF(Object.fromEntries(["subscription_price", "currency", "support_phone", "support_telegram", "support_email", "designer_name", "designer_contact", "designer_bio", "about_text", "payment_instructions"].map((k) => [k, String((s as Record<string, unknown>)[k] ?? "")])));
    setMethods(s.payment_methods);
  }, [settings.data]);

  if (settings.isLoading || me.isLoading) return <Loading />;
  if (!me.data?.isOwner) return <ErrorBox text="الإعدادات متاحة للمالك فقط." />;

  async function save() {
    const price = Number(f["subscription_price"]);
    if (!(price >= 0)) { toast.error("السعر يجب أن يكون رقمًا صحيحًا"); return; }
    setBusy(true);
    const { error } = await supabase.from("platform_settings").update({
      ...f, subscription_price: price,
      payment_methods: methods.filter((m) => m.name.trim()) as never,
    }).eq("id", 1);
    setBusy(false);
    if (error) { toast.error("تعذّر الحفظ"); return; }
    toast.success("تم حفظ الإعدادات");
    qc.invalidateQueries({ queryKey: ["platform_settings"] });
  }

  return (
    <div>
      <PageTitle title="الإعدادات" action={<Button onClick={save} disabled={busy}>حفظ</Button>} />
      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map(([k, l, t]) => (
            <div key={k} className="space-y-1"><Label>{l}</Label><Input type={t} dir="auto" value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">مدة الاشتراك ثابتة: سنة واحدة.</p>
      </Card>
      <Card className="mt-4">
        <h2 className="font-bold">طرق الدفع</h2>
        <div className="mt-3 space-y-2">
          {methods.map((m, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder="الاسم" value={m.name} onChange={(e) => setMethods(methods.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input placeholder="التفاصيل (رقم المحفظة…)" dir="auto" value={m.details} onChange={(e) => setMethods(methods.map((x, j) => (j === i ? { ...x, details: e.target.value } : x)))} />
              <Button variant="ghost" onClick={() => setMethods(methods.filter((_, j) => j !== i))}>حذف</Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setMethods([...methods, { name: "", details: "" }])}>إضافة طريقة</Button>
        </div>
        <div className="mt-4 space-y-1"><Label>تعليمات الدفع</Label><Textarea rows={4} value={f["payment_instructions"] ?? ""} onChange={(e) => setF({ ...f, payment_instructions: e.target.value })} /></div>
      </Card>
      <Card className="mt-4 space-y-3">
        <div className="space-y-1"><Label>نص «عن المشروع»</Label><Textarea rows={4} value={f["about_text"] ?? ""} onChange={(e) => setF({ ...f, about_text: e.target.value })} /></div>
        <div className="space-y-1"><Label>نبذة المصمم</Label><Textarea rows={3} value={f["designer_bio"] ?? ""} onChange={(e) => setF({ ...f, designer_bio: e.target.value })} /></div>
      </Card>
      <p className="mt-4 text-sm text-muted-foreground">لتعيين موظفين: من صفحة «الطلاب» اضغط «تعيين موظفًا» بجانب الحساب.</p>
    </div>
  );
}
