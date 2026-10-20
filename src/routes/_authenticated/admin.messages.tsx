import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { announceAndNotify, sendNotification } from "@/lib/staff.functions";
import { Card, fmtDate, PageTitle } from "@/components/app-ui";
import { pageMeta } from "@/lib/meta";

export const Route = createFileRoute("/_authenticated/admin/messages")({
  head: () =>
    pageMeta("الإعلانات والإشعارات", "نشر الإعلانات وإرسال الإشعارات عبر التطبيق و Telegram."),
  component: Messages,
});

function Messages() {
  const qc = useQueryClient();
  const announce = useServerFn(announceAndNotify);
  const notify = useServerFn(sendNotification);
  const departments = useQuery({
    queryKey: ["admin-departments"],
    queryFn: async () =>
      (await supabase.from("departments").select("id, name").eq("is_active", true).order("name"))
        .data ?? [],
  });
  const [a, setA] = useState({
    title: "",
    body: "",
    category: "عام",
    pinned: false,
    notify: true,
    targetDepartmentIds: [] as string[],
  });
  const [aLevels, setALevels] = useState("");
  const [n, setN] = useState({
    title: "",
    body: "",
    phone: "",
    telegram: true,
    targetDepartmentIds: [] as string[],
  });
  const [nLevels, setNLevels] = useState("");
  const [announcementFilter, setAnnouncementFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const anns = useQuery({
    queryKey: ["admin-anns"],
    queryFn: async () =>
      (
        await supabase
          .from("announcements")
          .select("*")
          .order("published_at", { ascending: false })
          .limit(30)
      ).data ?? [],
  });
  const deliv = useQuery({
    queryKey: ["admin-deliv"],
    queryFn: async () =>
      (
        await supabase
          .from("telegram_deliveries")
          .select("*")
          .neq("status", "sent")
          .order("created_at", { ascending: false })
          .limit(20)
      ).data ?? [],
  });

  async function submitA(e: FormEvent) {
    e.preventDefault();
    if (a.title.trim().length < 2 || a.body.trim().length < 2) {
      toast.error("اكتب العنوان والنص");
      return;
    }
    setBusy(true);
    try {
      const r = await announce({
        data: {
          ...a,
          targetLevels: aLevels
            .split(/[،,]/)
            .map((level) => level.trim())
            .filter(Boolean),
        },
      });
      toast.success(`تم النشر · Telegram للطلاب: ${r.sent} نجح، ${r.failed} فشل · الجروب: ${r.groupConfigured ? `${r.groupSent} وصل` : "غير مربوط"} · Push: ${r.pushConfigured ? `${r.pushSent} sent` : "not configured"}`);
      setA({ ...a, title: "", body: "" });
      qc.invalidateQueries();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setBusy(false);
  }
  async function submitN(e: FormEvent) {
    e.preventDefault();
    if (n.title.trim().length < 2 || n.body.trim().length < 2) {
      toast.error("اكتب العنوان والنص");
      return;
    }
    setBusy(true);
    try {
      let userId: string | null = null;
      if (n.phone.trim()) {
        const { data } = await supabase
          .from("profiles")
          .select("id")
          .eq("phone", n.phone.trim())
          .maybeSingle();
        if (!data) {
          setBusy(false);
          toast.error("لا يوجد طالب بهذا الرقم");
          return;
        }
        userId = data.id;
      }
      const r = await notify({
        data: {
          title: n.title,
          body: n.body,
          userId,
          telegram: n.telegram,
          targetDepartmentIds: userId ? [] : n.targetDepartmentIds,
          targetLevels: userId
            ? []
            : nLevels
                .split(/[،,]/)
                .map((level) => level.trim())
                .filter(Boolean),
        },
      });
      toast.success(`تم الإرسال · Telegram للطلاب: ${r.sent} نجح، ${r.failed} فشل · الجروب: ${r.groupConfigured ? `${r.groupSent} وصل` : "غير مربوط"} · Push: ${r.pushConfigured ? `${r.pushSent} sent` : "not configured"}`);
      setN({ ...n, title: "", body: "" });
      qc.invalidateQueries();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setBusy(false);
  }
  async function del(id: string) {
    if (!confirm("حذف الإعلان؟")) return;
    await supabase.from("announcements").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-anns"] });
  }
  const filteredAnnouncements = (anns.data ?? []).filter(
    (announcement) =>
      announcementFilter === "all" ||
      announcement.target_department_ids.includes(announcementFilter),
  );

  return (
    <div>
      <PageTitle title="الإعلانات والإشعارات" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-bold">إعلان جديد</h2>
          <form onSubmit={submitA} className="mt-3 space-y-3">
            <div className="space-y-1">
              <Label>العنوان</Label>
              <Input value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>التصنيف</Label>
              <Input
                value={a.category}
                onChange={(e) => setA({ ...a, category: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>النص</Label>
              <Textarea
                rows={5}
                value={a.body}
                onChange={(e) => setA({ ...a, body: e.target.value })}
              />
            </div>
            <fieldset className="space-y-2 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">القسم المستهدف</legend>
              <p className="text-xs text-muted-foreground">عدم اختيار أقسام يعني جميع الأقسام.</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {(departments.data ?? []).map((department) => (
                  <label key={department.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={a.targetDepartmentIds.includes(department.id)}
                      onChange={(e) =>
                        setA({
                          ...a,
                          targetDepartmentIds: e.target.checked
                            ? [...a.targetDepartmentIds, department.id]
                            : a.targetDepartmentIds.filter((id) => id !== department.id),
                        })
                      }
                    />
                    {department.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1">
              <Label>الفرق المستهدفة (اختياري)</Label>
              <Input
                placeholder="الأولى، الثانية"
                value={aLevels}
                onChange={(e) => setALevels(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                اتركه فارغًا لإرسال الإعلان لكل الفرق في الأقسام المحددة.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={a.pinned}
                onChange={(e) => setA({ ...a, pinned: e.target.checked })}
              />{" "}
              تثبيت في الأعلى
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={a.notify}
                onChange={(e) => setA({ ...a, notify: e.target.checked })}
              />{" "}
              إشعار المشتركين (التطبيق + الجهاز + Telegram)
            </label>
            <Button disabled={busy} className="w-full">
              نشر
            </Button>
          </form>
        </Card>
        <Card>
          <h2 className="font-bold">إشعار مباشر</h2>
          <form onSubmit={submitN} className="mt-3 space-y-3">
            <div className="space-y-1">
              <Label>رقم هاتف طالب (اتركه فارغًا لاختيار جمهور)</Label>
              <Input
                dir="ltr"
                value={n.phone}
                onChange={(e) => setN({ ...n, phone: e.target.value })}
              />
            </div>
            {!n.phone.trim() && (
              <>
                <fieldset className="space-y-2 rounded-md border p-3">
                  <legend className="px-1 text-sm font-medium">القسم المستهدف</legend>
                  <p className="text-xs text-muted-foreground">
                    عدم اختيار أقسام يعني جميع الأقسام.
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {(departments.data ?? []).map((department) => (
                      <label key={department.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={n.targetDepartmentIds.includes(department.id)}
                          onChange={(e) =>
                            setN({
                              ...n,
                              targetDepartmentIds: e.target.checked
                                ? [...n.targetDepartmentIds, department.id]
                                : n.targetDepartmentIds.filter((id) => id !== department.id),
                            })
                          }
                        />
                        {department.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="space-y-1">
                  <Label>الفرق المستهدفة (اختياري)</Label>
                  <Input
                    placeholder="الأولى، الثانية"
                    value={nLevels}
                    onChange={(e) => setNLevels(e.target.value)}
                  />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label>العنوان</Label>
              <Input value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>النص</Label>
              <Textarea
                rows={4}
                value={n.body}
                onChange={(e) => setN({ ...n, body: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={n.telegram}
                onChange={(e) => setN({ ...n, telegram: e.target.checked })}
              />{" "}
              إرسال على Telegram أيضًا
            </label>
            <Button disabled={busy} className="w-full">
              إرسال
            </Button>
          </form>
        </Card>
      </div>
      <Card className="mt-4">
        <h2 className="font-bold">الإعلانات المنشورة</h2>
        <select
          className="mt-2 h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="تصفية الإعلانات حسب القسم"
          value={announcementFilter}
          onChange={(e) => setAnnouncementFilter(e.target.value)}
        >
          <option value="all">كل الأقسام</option>
          {(departments.data ?? []).map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
        <ul className="mt-2 divide-y text-sm">
          {filteredAnnouncements.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                {x.pinned ? "📌 " : ""}
                {x.title} <span className="text-muted-foreground">· {fmtDate(x.published_at)}</span>
                <span className="ms-2 text-xs text-muted-foreground">
                  {x.target_department_ids.length
                    ? `${x.target_department_ids.length} قسم مستهدف`
                    : "كل الأقسام"}
                </span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => del(x.id)}>
                حذف
              </Button>
            </li>
          ))}
          {filteredAnnouncements.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">لا توجد إعلانات لهذا القسم.</li>
          )}
        </ul>
      </Card>
      {(deliv.data ?? []).length > 0 && (
        <Card className="mt-4">
          <h2 className="font-bold">آخر رسائل Telegram الفاشلة</h2>
          <ul className="mt-2 divide-y text-xs">
            {deliv.data!.map((d) => (
              <li key={d.id} className="py-2">
                {d.status} · {fmtDate(d.created_at, true)} · {d.error}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
