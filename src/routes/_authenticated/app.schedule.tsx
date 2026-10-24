import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { AccessGate, Card, Empty, ErrorBox, fmtDate, kindLabel, Loading, PageTitle } from "@/components/app-ui";
import { pageMeta } from "@/lib/meta";
import { useText } from "@/hooks/use-preferences";
import { Button } from "@/components/ui/button";
import { asChanges, ScheduleUpdates, useScheduleChanges } from "@/components/schedule-updates";
import { addDays, cairoToday, occurrencesOn, weekdayOf } from "@/lib/schedule-changes";

export const Route = createFileRoute("/_authenticated/app/schedule")({
  head: () => pageMeta("المواعيد", "مواعيد المحاضرات والامتحانات والتكليفات."),
  component: Schedule,
});

const tabs = [["all", "الكل", "All"], ["lecture", "محاضرات", "Lectures"], ["exam", "امتحانات", "Exams"], ["assignment", "تكليفات", "Assignments"]] as const;
const kindLabelEn: Record<string, string> = { lecture: "Lecture", exam: "Exam", assignment: "Assignment", other: "Event" };
const weekDays = [
  ["الأحد", "Sunday"], ["الاثنين", "Monday"], ["الثلاثاء", "Tuesday"],
  ["الأربعاء", "Wednesday"], ["الخميس", "Thursday"], ["الجمعة", "Friday"], ["السبت", "Saturday"],
] as const;

function Schedule() {
  const me = useMe();
  const t = useText();
  const [tab, setTab] = useState<string>("all");
  const changes = useScheduleChanges(me.data?.id, !!me.data?.hasAccess);
  const q = useQuery({
    queryKey: ["events"],
    enabled: !!me.data?.hasAccess,
    queryFn: async () => (await supabase.from("events").select("*, subjects(name)").gte("starts_at", new Date(Date.now() - 86_400_000).toISOString()).order("starts_at").limit(200)).data ?? [],
  });
  const weekly = useQuery({
    queryKey: ["class-schedule", me.data?.id],
    enabled: !!me.data?.hasAccess,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_schedule")
        .select("*, subjects(name)")
        .order("day_of_week")
        .order("starts_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  if (me.isLoading) return <Loading />;
  if (!me.data?.hasAccess) return <AccessGate status={me.data?.status ?? "awaiting_payment"} linked={!!me.data?.tg} />;
  if (q.isLoading) return <Loading />;
  const list = (q.data ?? []).filter((e) => tab === "all" || e.kind === tab);
  return (
    <div>
      <PageTitle title={t("المواعيد والامتحانات", "Schedule and exams")} />
      <ScheduleUpdates userId={me.data?.id} enabled={!!me.data?.hasAccess} limit={20} />
      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{t("جدول الحصص الأسبوعي", "Weekly class timetable")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("حصص تخصصك مرتبة حسب أيام الأسبوع.", "Your classes, organized by day of the week.")}</p>
          </div>
          <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">{t("كل أسبوع", "Every week")}</span>
        </div>
        {weekly.isLoading ? <Loading /> : weekly.isError ? (
          <ErrorBox text={t("تعذّر تحميل جدول الحصص.", "Could not load the class timetable.")} />
        ) : (weekly.data ?? []).length === 0 ? (
          <Empty title={t("لم تتم إضافة جدول حصصك بعد", "Your timetable has not been added yet")} text={t("سيظهر هنا بمجرد أن تضيف الإدارة مواعيد المحاضرات الأسبوعية.", "Your classes will appear here once the administration adds them.")} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {weekDays.map(([day, englishDay], dayIndex) => {
              const today = cairoToday();
              const date = addDays(today, (dayIndex - weekdayOf(today) + 7) % 7);
              const sessions = occurrencesOn(date, (weekly.data ?? []).map((session) => ({ ...session, subject: session.subjects?.name ?? t("محاضرة", "Class") })), asChanges(changes.data ?? []));
              return (
                <Card key={day} className={sessions.length ? "border-primary/20" : "opacity-75"}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-bold">{t(day, englishDay)}</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{sessions.length}</span>
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">{date}</p>
                  {changes.isError && <p role="alert" className="mb-2 text-xs text-destructive">{t("حالة التعديلات غير متاحة", "Change status unavailable")}</p>}
                  {sessions.length ? (
                    <ul className="space-y-2">
                      {sessions.map((session) => (
                        <li key={`${session.sessionId}-${session.movedTo ?? date}`} className="rounded-md bg-muted/70 p-3">
                          <p className="font-semibold">{session.subject}</p>
                          {session.status !== "normal" && <p className={`mt-1 text-xs font-bold ${session.status === "cancelled" ? "text-destructive" : "text-warning"}`}>{session.status === "cancelled" ? t("ملغاة", "Cancelled") : session.status === "postponed" ? `${t("مؤجلة إلى", "Postponed to")} ${session.movedTo}` : session.status === "moved_here" ? t("موعد بعد التأجيل", "Rescheduled") : t("تم التعديل", "Updated")}</p>}
                          <p className={`mt-1 text-sm font-medium text-primary ${session.status === "cancelled" || session.status === "postponed" ? "line-through" : ""}`} dir="ltr">{session.startsAt} – {session.endsAt}</p>
                          {(session.location || session.instructor) && (
                            <p className="mt-1 text-xs text-muted-foreground">{[session.location, session.instructor].filter(Boolean).join(" · ")}</p>
                          )}
                          {session.reason && <p className="mt-1 text-xs text-muted-foreground">{session.reason}</p>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="py-2 text-sm text-muted-foreground">{t("لا توجد حصص", "No classes")}</p>}
                </Card>
              );
            })}
          </div>
        )}
      </section>
      <h2 className="mb-3 text-lg font-bold">{t("المواعيد والامتحانات", "Upcoming events")}</h2>
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([k, l, englishLabel]) => (
          <Button key={k} onClick={() => setTab(k)} variant={tab === k ? "default" : "secondary"} size="sm">{t(l, englishLabel)}</Button>
        ))}
      </div>
      {list.length === 0 ? <Empty title={t("لا توجد مواعيد قادمة", "No upcoming events")} /> : (
        <div className="space-y-3">
          {list.map((e) => (
            <Card key={e.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${e.kind === "exam" ? "bg-destructive/10 text-destructive" : "bg-primary-soft text-primary"}`}>{t(kindLabel[e.kind] ?? e.kind, kindLabelEn[e.kind] ?? e.kind)}</span>
                  <p className="mt-2 font-bold">{e.title}</p>
                  <p className="text-sm text-muted-foreground">{[(e.subjects as { name: string } | null)?.name, e.location].filter(Boolean).join(" · ")}</p>
                  {e.notes && <p className="mt-1 text-sm">{e.notes}</p>}
                </div>
                <p className="text-sm font-semibold text-navy">{fmtDate(e.starts_at, true)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
