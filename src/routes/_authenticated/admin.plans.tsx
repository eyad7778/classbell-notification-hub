import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, Empty, Loading, PageTitle } from "@/components/app-ui";
import { pageMeta } from "@/lib/meta";
import {
  getAdminSubscriptionPlans,
  removeSubscriptionPlan,
  saveSubscriptionPlan,
} from "@/lib/staff.functions";
import type { SubscriptionPlan } from "@/integrations/supabase/schema-extensions";

type PlanForm = {
  id?: string;
  name: string;
  description: string;
  price: string;
  durationDays: string;
  features: string;
  isActive: boolean;
  sortOrder: string;
};

const blankPlan: PlanForm = {
  name: "",
  description: "",
  price: "",
  durationDays: "365",
  features: "",
  isActive: true,
  sortOrder: "0",
};

export const Route = createFileRoute("/_authenticated/admin/plans")({
  head: () => pageMeta("إدارة الباقات", "إضافة الباقات الدراسية وتعديلها."),
  component: PlansPage,
});

function PlansPage() {
  const queryClient = useQueryClient();
  const loadPlans = useServerFn(getAdminSubscriptionPlans);
  const savePlan = useServerFn(saveSubscriptionPlan);
  const removePlan = useServerFn(removeSubscriptionPlan);
  const [form, setForm] = useState<PlanForm | null>(null);
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["admin-subscription-plans"],
    queryFn: () => loadPlans(),
  });

  function edit(plan: SubscriptionPlan) {
    setForm({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: String(plan.price),
      durationDays: String(plan.duration_days),
      features: plan.features.join("\n"),
      isActive: plan.is_active,
      sortOrder: String(plan.sort_order),
    });
  }

  async function save() {
    if (!form) return;
    const price = Number(form.price);
    const durationDays = Number(form.durationDays);
    const sortOrder = Number(form.sortOrder);
    if (!form.name.trim() || !Number.isFinite(price) || price < 0 ||
      !Number.isInteger(durationDays) || durationDays < 1 ||
      !Number.isInteger(sortOrder)) {
      toast.error("تحقق من الاسم والسعر والمدة والترتيب.");
      return;
    }

    setBusy(true);
    try {
      await savePlan({
        data: {
          ...(form.id ? { id: form.id } : {}),
          name: form.name.trim(),
          description: form.description.trim(),
          price,
          durationDays,
          features: form.features.split("\n").map((feature) => feature.trim()).filter(Boolean),
          isActive: form.isActive,
          sortOrder,
        },
      });
      toast.success("تم حفظ الباقة");
      setForm(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حفظ الباقة");
    } finally {
      setBusy(false);
    }
  }

  async function remove(plan: SubscriptionPlan) {
    if (!confirm(`حذف أو أرشفة الباقة «${plan.name}»؟`)) return;
    setBusy(true);
    try {
      const result = await removePlan({ data: { id: plan.id } });
      toast.success(result.archived ? "للباقة سجلات مرتبطة، تمت أرشفتها." : "تم حذف الباقة.");
      await queryClient.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حذف الباقة");
    } finally {
      setBusy(false);
    }
  }

  if (query.isLoading) return <Loading />;
  if (query.isError) {
    return <p role="alert" className="text-sm text-destructive">تعذّر تحميل الباقات. أعد تحميل الصفحة.</p>;
  }

  return (
    <div>
      <PageTitle
        title="إدارة الباقات"
        subtitle="تظهر للطلاب الباقات النشطة فقط. تُؤرشف الباقة عند ارتباطها بسجلات اشتراك."
        action={<Button onClick={() => setForm({ ...blankPlan })}>إضافة باقة</Button>}
      />
      {form && (
        <Card className="mb-4 space-y-4">
          <h2 className="font-bold">{form.id ? "تعديل الباقة" : "باقة جديدة"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="plan-name">اسم الباقة</Label>
              <Input id="plan-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={100} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-price">السعر</Label>
              <Input id="plan-price" type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-duration">المدة بالأيام</Label>
              <Input id="plan-duration" type="number" min="1" max="3650" step="1" value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: event.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-order">ترتيب الظهور</Label>
              <Input id="plan-order" type="number" step="1" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="plan-description">الوصف</Label>
            <Textarea id="plan-description" rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={2000} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="plan-features">المميزات (ميزة في كل سطر)</Label>
            <Textarea id="plan-features" rows={5} value={form.features} onChange={(event) => setForm({ ...form, features: event.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
            الباقة نشطة ومتاحة للطلاب
          </label>
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>حفظ الباقة</Button>
            <Button variant="outline" onClick={() => setForm(null)} disabled={busy}>إلغاء</Button>
          </div>
        </Card>
      )}
      {!query.data?.length ? (
        <Empty title="لا توجد باقات بعد" />
      ) : (
        <div className="space-y-3">
          {query.data.map((plan) => (
            <Card key={plan.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">{plan.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                  <p className="mt-2 text-sm">{plan.price} · {plan.duration_days} يومًا · ترتيب {plan.sort_order}</p>
                  <p className={`mt-1 text-xs font-semibold ${plan.is_active ? "text-success" : "text-muted-foreground"}`}>{plan.is_active ? "نشطة" : "متوقفة / مؤرشفة"}</p>
                  {plan.features.length > 0 && <p className="mt-2 text-sm">{plan.features.join(" · ")}</p>}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => edit(plan)}>تعديل / تفعيل</Button>
                  <Button variant="destructive" onClick={() => remove(plan)} disabled={busy}>حذف / أرشفة</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
