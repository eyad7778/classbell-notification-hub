import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { reviewPayment } from "@/lib/staff.functions";
import { Card, Empty, fmtDate, Loading, PageTitle } from "@/components/app-ui";
import { pageMeta } from "@/lib/meta";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => pageMeta("لوحة الإدارة", "مؤشرات المنصة ومراجعة طلبات الدفع."),
  component: AdminHome,
});

function AdminHome() {
  const qc = useQueryClient();
  const review = useServerFn(reviewPayment);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const c = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
      const [students, active, pending, linked, failed] = await Promise.all([
        c(supabase.from("profiles").select("id", { count: "exact", head: true })),
        c(supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active").gt("end_at", now)),
        c(supabase.from("payment_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
        c(supabase.from("telegram_links").select("user_id", { count: "exact", head: true })),
        c(supabase.from("telegram_deliveries").select("id", { count: "exact", head: true }).neq("status", "sent")),
      ]);
      return { students, active, pending, linked, failed };
    },
  });
  const pending = useQuery({
    queryKey: ["admin-pending"],
    queryFn: async () => {
      const { data } = await supabase.from("payment_requests").select("*").eq("status", "pending").order("created_at");
      const ids = (data ?? []).map((x) => x.user_id);
      const { data: ps } = ids.length ? await supabase.from("profiles").select("id, full_name, phone").in("id", ids) : { data: [] };
      const map = new Map((ps ?? []).map((p) => [p.id, p]));
      return (data ?? []).map((r) => ({ ...r, profile: map.get(r.user_id) }));
    },
  });

  async function act(id: string, approve: boolean) {
    setBusy(id);
    try {
      await review({ data: { id, approve, note: notes[id] || undefined } });
      toast.success(approve ? "تم التفعيل وإشعار الطالب" : "تم الرفض وإشعار الطالب");
      qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); }
    setBusy("");
  }
  async function receipt(path: string) {
    const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 300);
    if (data) window.open(data.signedUrl, "_blank", "noopener");
  }

  const s = stats.data;
  return (
    <div>
      <PageTitle title="لوحة الإدارة" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["الحسابات", s?.students], ["اشتراكات فعّالة", s?.active], ["طلبات معلّقة", s?.pending], ["مرتبطون بـ Telegram", s?.linked], ["رسائل فاشلة", s?.failed]].map(([l, v]) => (
          <Card key={l as string}><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-2xl font-extrabold text-navy">{v ?? "…"}</p></Card>
        ))}
      </div>
      <h2 className="mb-3 mt-8 text-lg font-bold">طلبات الدفع المعلّقة</h2>
      {pending.isLoading ? <Loading /> : (pending.data ?? []).length === 0 ? <Empty title="لا توجد طلبات معلّقة" /> : (
        <div className="space-y-3">
          {pending.data!.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <div>
                  <p className="font-bold">{r.profile?.full_name ?? "—"} <span className="font-normal text-muted-foreground" dir="ltr">{r.profile?.phone}</span></p>
                  <p className="mt-1">{r.method} · {r.amount} · رقم العملية: <span dir="auto">{r.reference}</span></p>
                  <p className="text-xs text-muted-foreground">{fmtDate(r.created_at, true)}</p>
                </div>
                {r.receipt_path && <Button variant="outline" size="sm" onClick={() => receipt(r.receipt_path!)}>عرض الإيصال</Button>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Input className="min-w-48 flex-1" placeholder="ملاحظة (اختياري، تظهر للطالب)" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                <Button disabled={busy === r.id} onClick={() => act(r.id, true)}>تفعيل</Button>
                <Button disabled={busy === r.id} variant="destructive" onClick={() => act(r.id, false)}>رفض</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
