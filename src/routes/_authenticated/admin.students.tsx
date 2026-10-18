import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { effectiveStatus, statusLabel, useMe, type SubStatus } from "@/hooks/use-me";
import {
  resetStudentPassword,
  setStaffRole,
  setSubscriptionStatus,
  unlinkTelegram,
} from "@/lib/staff.functions";
import { Card, Empty, fmtDate, Loading, PageTitle } from "@/components/app-ui";
import { pageMeta } from "@/lib/meta";

export const Route = createFileRoute("/_authenticated/admin/students")({
  head: () => pageMeta("إدارة الطلاب", "حالات الاشتراك وربط Telegram للطلاب."),
  component: Students,
});

function Students() {
  const me = useMe();
  const qc = useQueryClient();
  const setStatus = useServerFn(setSubscriptionStatus);
  const resetPw = useServerFn(resetStudentPassword);
  const unlink = useServerFn(unlinkTelegram);
  const staffRole = useServerFn(setStaffRole);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [academic, setAcademic] = useState<Record<string, { departmentId: string; level: string }>>(
    {},
  );
  const departments = useQuery({
    queryKey: ["admin-departments"],
    queryFn: async () =>
      (await supabase.from("departments").select("id, name, is_active").order("name")).data ?? [],
  });
  const q = useQuery({
    queryKey: ["admin-students"],
    queryFn: async () => {
      const [p, s, t, r] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("subscriptions").select("user_id, status, end_at"),
        supabase
          .from("telegram_links")
          .select("user_id, blocked, last_send_status, telegram_username"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const sm = new Map((s.data ?? []).map((x) => [x.user_id, x]));
      const tm = new Map((t.data ?? []).map((x) => [x.user_id, x]));
      return (p.data ?? []).map((x) => ({
        ...x,
        status: effectiveStatus(sm.get(x.id) as never) as SubStatus,
        end_at: sm.get(x.id)?.end_at ?? null,
        tg: tm.get(x.id),
        roles: (r.data ?? []).filter((y) => y.user_id === x.id).map((y) => y.role as string),
      }));
    },
  });

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (q.isLoading) return <Loading />;
  const list = (q.data ?? []).filter(
    (x) =>
      (filter === "all" || x.status === filter) &&
      (departmentFilter === "all" || x.department_id === departmentFilter) &&
      (!search ||
        x.full_name.includes(search) ||
        x.phone.includes(search) ||
        (x.student_code ?? "").includes(search)),
  );
  return (
    <div>
      <PageTitle title="الطلاب" subtitle={`${q.data?.length ?? 0} حساب`} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="بحث بالاسم أو الهاتف"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">كل الأقسام</option>
          {(departments.data ?? []).map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">كل الحالات</option>
          {Object.entries(statusLabel).map(([k, v]) => (
            <option key={k} value={k}>
              {v.text}
            </option>
          ))}
        </select>
      </div>
      {list.length === 0 ? (
        <Empty title="لا نتائج" />
      ) : (
        <div className="space-y-3">
          {list.map((x) => (
            <Card key={x.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold">
                    {x.full_name}{" "}
                    {x.roles
                      .filter((r) => r !== "student")
                      .map((r) => (
                        <span
                          key={r}
                          className="ms-1 rounded bg-navy px-1.5 text-xs text-primary-foreground"
                        >
                          {r === "owner" ? "مالك" : "موظف"}
                        </span>
                      ))}
                  </p>
                  <p className="text-sm text-muted-foreground" dir="ltr">
                    {x.phone}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    كود الطالب: {x.student_code || "غير مسجل"} ·{" "}
                    {departments.data?.find((d) => d.id === x.department_id)?.name ?? "بلا قسم"} ·{" "}
                    {x.level || "الفرقة غير محددة"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Telegram:{" "}
                    {x.tg
                      ? x.tg.blocked
                        ? "محظور"
                        : `مرتبط${x.tg.telegram_username ? ` @${x.tg.telegram_username}` : ""}`
                      : "غير مرتبط"}
                    {x.end_at && ` · ينتهي ${fmtDate(x.end_at)}`}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${statusLabel[x.status].cls}`}
                >
                  {statusLabel[x.status].text}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                <select
                  className="h-9 min-w-40 rounded-md border border-input bg-background px-2 text-sm"
                  aria-label={`قسم ${x.full_name}`}
                  value={academic[x.id]?.departmentId ?? x.department_id ?? ""}
                  onChange={(e) =>
                    setAcademic({
                      ...academic,
                      [x.id]: {
                        departmentId: e.target.value,
                        level: academic[x.id]?.level ?? x.level ?? "",
                      },
                    })
                  }
                >
                  <option value="">بلا قسم</option>
                  {(departments.data ?? []).map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                      {department.is_active ? "" : " (متوقف)"}
                    </option>
                  ))}
                </select>
                <Input
                  className="h-9 max-w-40"
                  aria-label={`الفرقة الدراسية لـ ${x.full_name}`}
                  placeholder="الفرقة الدراسية"
                  value={academic[x.id]?.level ?? x.level ?? ""}
                  onChange={(e) =>
                    setAcademic({
                      ...academic,
                      [x.id]: {
                        departmentId: academic[x.id]?.departmentId ?? x.department_id ?? "",
                        level: e.target.value,
                      },
                    })
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    run(async () => {
                      const value = academic[x.id] ?? {
                        departmentId: x.department_id ?? "",
                        level: x.level ?? "",
                      };
                      const { error } = await supabase
                        .from("profiles")
                        .update({
                          department_id: value.departmentId || null,
                          level: value.level.trim() || null,
                        })
                        .eq("id", x.id);
                      if (error) throw new Error("تعذّر تحديث القسم والفرقة");
                    }, "تم تحديث بيانات الطالب")
                  }
                >
                  حفظ القسم والفرقة
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {x.status !== "active" && (
                  <Button
                    size="sm"
                    onClick={() =>
                      run(
                        () => setStatus({ data: { userId: x.id, status: "active" } }),
                        "تم التفعيل",
                      )
                    }
                  >
                    تفعيل
                  </Button>
                )}
                {x.status === "active" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      run(
                        () => setStatus({ data: { userId: x.id, status: "suspended" } }),
                        "تم الإيقاف",
                      )
                    }
                  >
                    إيقاف
                  </Button>
                )}
                {x.tg && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      confirm("فصل ربط Telegram؟") &&
                      run(() => unlink({ data: { userId: x.id } }), "تم فصل الربط")
                    }
                  >
                    فصل Telegram
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const pw = prompt("كلمة المرور الجديدة (8 أحرف على الأقل)");
                    if (pw)
                      run(
                        () => resetPw({ data: { userId: x.id, password: pw } }),
                        "تم تغيير كلمة المرور",
                      );
                  }}
                >
                  كلمة مرور جديدة
                </Button>
                {me.data?.isOwner && !x.roles.includes("owner") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      run(
                        () =>
                          staffRole({
                            data: { phone: x.phone, makeStaff: !x.roles.includes("staff") },
                          }),
                        "تم تحديث الصلاحية",
                      )
                    }
                  >
                    {x.roles.includes("staff") ? "إزالة صلاحية موظف" : "تعيين موظفًا"}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
