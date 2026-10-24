import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BookOpen,
  CalendarClock,
  ChevronLeft,
  CircleAlert,
  FileText,
  Megaphone,
} from "lucide-react";
import { toast } from "sonner";
import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { statusLabel, useMe } from "@/hooks/use-me";
import { AccessGate, Card, ErrorBox, fmtDate, kindLabel, Loading } from "@/components/app-ui";
import { useText } from "@/hooks/use-preferences";
import { ScheduleUpdates } from "@/components/schedule-updates";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "لوحتي — Smart Student" },
      { name: "description", content: "ملخص حسابك ومحتواك الدراسي." },
      { property: "og:title", content: "لوحتي — Smart Student" },
      { property: "og:description", content: "ملخص حسابك ومحتواك الدراسي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudentHome,
});

function StudentHome() {
  const me = useMe();
  const t = useText();
  const queryClient = useQueryClient();
  const [idCardBusy, setIdCardBusy] = useState(false);
  const [idCardError, setIdCardError] = useState("");
  const userId = me.data?.id;
  const hasAccess = me.data?.hasAccess;
  const departmentId = me.data?.profile?.department_id;
  async function uploadIdCard(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !userId) return;
    setIdCardError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setIdCardError(t("اختر صورة JPG أو PNG أو WEBP.", "Choose a JPG, PNG, or WEBP image."));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setIdCardError(t("حجم الصورة يجب ألا يتجاوز 5 ميجابايت.", "The image must be 5 MB or smaller."));
      return;
    }
    setIdCardBusy(true);
    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("student-ids").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) {
      setIdCardBusy(false);
      setIdCardError(t("تعذّر رفع الصورة. حاول مرة أخرى.", "Could not upload the image. Try again."));
      return;
    }
    const { error: profileError } = await supabase.from("profiles").update({ id_card_path: path }).eq("id", userId);
    if (profileError) {
      await supabase.storage.from("student-ids").remove([path]);
      setIdCardBusy(false);
      setIdCardError(t("تعذّر حفظ الصورة. حاول مرة أخرى.", "Could not save the image. Try again."));
      return;
    }
    setIdCardBusy(false);
    toast.success(t("تم رفع صورة الكارنيه للمراجعة", "Your ID photo was uploaded for review"));
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  }
  const feed = useQuery({
    queryKey: ["home-feed", userId],
    enabled: !!hasAccess && !!userId,
    queryFn: async () => {
      if (!userId) throw new Error("not signed in");
      const [
        announcements,
        events,
        subjects,
        notifications,
        notificationReads,
        announcementReads,
        latestLectures,
      ] = await Promise.all([
        supabase
          .from("announcements")
          .select("id, title, body, category, published_at, pinned")
          .order("pinned", { ascending: false })
          .order("published_at", { ascending: false })
          .limit(4),
        supabase
          .from("events")
          .select("id, title, kind, starts_at, subjects(name)")
          .gte("starts_at", new Date().toISOString())
          .order("starts_at")
          .limit(4),
        supabase
          .from("subjects")
          .select("id, name, code, level, lectures(count)")
          .order("sort_order"),
        supabase
          .from("notifications")
          .select("id, title, body, created_at")
          .order("created_at", { ascending: false })
          .limit(4),
        supabase.from("notification_reads").select("notification_id").eq("user_id", userId),
        supabase.from("announcement_reads").select("announcement_id").eq("user_id", userId),
        supabase
          .from("lectures")
          .select("id, title, week, subject_id, created_at, subjects(name)")
          .order("created_at", { ascending: false })
          .limit(4),
      ]);
      const readIds = new Set((notificationReads.data ?? []).map((item) => item.notification_id));
      const announcementReadIds = new Set(
        (announcementReads.data ?? []).map((item) => item.announcement_id),
      );
      return {
        announcements: (announcements.data ?? []).map((item) => ({
          ...item,
          read: announcementReadIds.has(item.id),
        })),
        events: events.data ?? [],
        subjects: subjects.data ?? [],
        notifications: (notifications.data ?? []).map((item) => ({
          ...item,
          read: readIds.has(item.id),
        })),
        latestLectures: latestLectures.data ?? [],
      };
    },
  });
  const departmentName = useQuery({
    queryKey: ["student-department", departmentId],
    enabled: !!departmentId,
    queryFn: async () => {
      if (!departmentId) return null;
      return (await supabase.from("departments").select("name").eq("id", departmentId).maybeSingle()).data?.name ?? null;
    },
  });

  async function markRead(notificationId: string) {
    if (!userId) return;
    const { error } = await supabase
      .from("notification_reads")
      .upsert(
        { notification_id: notificationId, user_id: userId },
        { onConflict: "notification_id,user_id", ignoreDuplicates: true },
      );
    if (error) toast.error(t("تعذّر تحديث الإشعار", "Could not update the notification"));
    else {
      await feed.refetch();
      queryClient.invalidateQueries({ queryKey: ["unread"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  }
  async function markAnnouncementRead(announcementId: string) {
    if (!userId) return;
    const { error } = await supabase
      .from("announcement_reads")
      .upsert(
        { announcement_id: announcementId, user_id: userId },
        { onConflict: "announcement_id,user_id", ignoreDuplicates: true },
      );
    if (error) toast.error(t("تعذّر تحديث الإعلان", "Could not update the announcement"));
    else {
      await feed.refetch();
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    }
  }

  if (me.isLoading) return <Loading />;
  if (!me.data) return <ErrorBox />;
  const { profile, status, tg } = me.data;
  const statusInfo = statusLabel[status];
  const statusText = t(statusInfo.text, {
    pending: "Under review",
    awaiting_payment: "Awaiting payment",
    active: "Active",
    expired: "Expired",
    suspended: "Suspended",
    rejected: "Rejected",
  }[status]);
  const subjectCount = feed.data?.subjects.length ?? 0;
  const lectureCount = (feed.data?.subjects ?? []).reduce(
    (count, subject) =>
      count + ((subject.lectures as unknown as { count: number }[])?.[0]?.count ?? 0),
    0,
  );
  const newAnnouncementCount = (feed.data?.announcements ?? []).filter(
    (announcement) => !announcement.read,
  ).length;
  const upcomingCount = feed.data?.events.length ?? 0;
  const summary = [
    { label: t("المواد", "Subjects"), value: subjectCount, color: "bg-sky-100 text-sky-950 dark:bg-sky-900/40 dark:text-sky-100" },
    { label: t("المحاضرات", "Lectures"), value: lectureCount, color: "bg-violet-100 text-violet-950 dark:bg-violet-900/40 dark:text-violet-100" },
    { label: t("إعلانات جديدة", "New announcements"), value: newAnnouncementCount, color: "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100" },
    { label: t("مواعيد قادمة", "Upcoming dates"), value: upcomingCount, color: "bg-rose-100 text-rose-950 dark:bg-rose-900/40 dark:text-rose-100" },
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-5">
          <div>
            <p className="text-sm text-muted-foreground">{t("مرحبًا،", "Welcome,")} {profile?.full_name || t("طالب", "student")}</p>
            <h1 className="mt-1 text-2xl font-bold">{t("لوحتك الدراسية", "Your study dashboard")}</h1>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusInfo.cls}`}>
            {statusText}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 px-5 py-3 text-xs">
          {departmentName.data && (
            <span className="rounded-full bg-primary-soft px-3 py-1 text-primary">
              {departmentName.data}
            </span>
          )}
          {profile?.level && (
            <span className="rounded-full bg-muted px-3 py-1">{profile.level}</span>
          )}
        </div>
      </section>

      {me.data.profile?.registration_status === "pending" ? (
        <Card className="border-warning/40 bg-warning-soft/40">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" />
            <div>
              <h2 className="font-bold">{t("حسابك قيد مراجعة الإدارة", "Your account is waiting for review")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {me.data.profile?.id_card_path
                  ? t("هنراجع صورة الكارنيه ونفعّل الحساب. هتتحذف الصورة تلقائيًا بعد التفعيل.", "We will review your student ID and activate your account. The image will be deleted automatically after approval.")
                  : t("ارفع صورة الكارنيه لإكمال مراجعة الحساب. هتتحذف الصورة تلقائيًا بعد التفعيل.", "Upload your ID photo to complete account review. The image will be deleted automatically after approval.")}
              </p>
              {!me.data.profile?.id_card_path && (
                <div className="mt-3 max-w-sm space-y-2">
                  <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadIdCard} disabled={idCardBusy} />
                  {idCardBusy && <p className="text-xs text-muted-foreground">{t("جارٍ رفع الصورة…", "Uploading image…")}</p>}
                  {idCardError && <p role="alert" className="text-xs text-destructive">{idCardError}</p>}
                </div>
              )}
            </div>
          </div>
        </Card>
      ) : !me.data.hasAccess ? (
        <Card className="border-warning/40 bg-warning-soft/40">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" />
            <div>
              <h2 className="font-bold">{t("هناك خطوة مطلوبة لإظهار محتواك الدراسي", "One step is needed to unlock your study content")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {me.data.profile?.registration_status === "active" && status !== "active"
                  ? t("تم تفعيل حسابك! ابدأ الاشتراك من صفحة حسابي لتتمكن من فتح المواد والمواعيد.", "Your account is approved! Start your subscription from My Account to unlock subjects and schedules.")
                  : tg
                    ? t("فعّل اشتراكك لعرض المواد والمواعيد المخصصة لقسمك.", "Activate your subscription to view subjects and dates for your department.")
                    : status === "active"
                      ? t("اربط Telegram لإكمال الوصول.", "Link Telegram to finish setting up access.")
                      : t("أكمل الاشتراك، ثم اربط Telegram من داخل المنصة.", "Activate your subscription, then link Telegram from the app.")}
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" asChild>
                  <Link to={status === "active" ? (tg ? "/app/subscription" : "/app/telegram") : "/app/subscription"}>
                    {status === "active"
                      ? tg ? t("عرض الاشتراك", "View subscription") : t("ربط Telegram", "Link Telegram")
                      : t("اشترك الآن", "Subscribe now")}
                  </Link>
                </Button>
                {status === "active" && !tg && (
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/app/subscription">{t("الاشتراك", "Subscription")}</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <AccessGate status={status} linked={!!tg} />
          </div>
        </Card>
      ) : feed.isLoading ? (
        <Loading />
      ) : feed.isError ? (
        <ErrorBox text={t("تعذّر تحميل بيانات لوحتك. أعد المحاولة.", "Could not load your dashboard. Try again.")} />
      ) : (
        <>
          <section aria-label={t("ملخص الدراسة", "Study overview")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {summary.map((item) => (
              <div key={item.label} className={`rounded-xl border border-transparent p-4 ${item.color}`}>
                <p className="text-xs font-semibold">{item.label}</p>
                <p className="mt-1 text-2xl font-extrabold">{item.value}</p>
              </div>
            ))}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <BookOpen className="size-5 text-primary" /> {t("موادي الدراسية", "My subjects")}
              </h2>
              <Link to="/app/subjects" className="text-sm text-primary">
                {t("كل المواد", "All subjects")}
              </Link>
            </div>
            {!feed.data?.subjects.length ? (
              <Card>
                <p className="text-sm text-muted-foreground">{t("لم تُضف مواد لقسمك وفرقتك بعد.", "No subjects are available for your department and level yet.")}</p>
              </Card>
            ) : (
              <div className="divide-y rounded-xl border bg-card px-4">
                {feed.data.subjects.map((subject, index) => (
                  <Link
                    key={subject.id}
                    to="/app/subjects/$id"
                    params={{ id: subject.id }}
                    className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/40"
                  >
                    <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${["bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200", "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200", "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"][index % 3]}`}>
                      <BookOpen className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{subject.name}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {[subject.code, subject.level].filter(Boolean).join(" · ") || t("مادة دراسية", "Subject")}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {(subject.lectures as unknown as { count: number }[])?.[0]?.count ?? 0} {t("محاضرة", "lectures")}
                    </span>
                    <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Megaphone className="size-5 text-primary" /> {t("آخر الإعلانات", "Latest announcements")}
                </h2>
                <Link to="/app/announcements" className="text-sm text-primary">
                  {t("كل الإعلانات", "All announcements")}
                </Link>
              </div>
              <div className="divide-y rounded-xl border bg-card px-4">
                {!feed.data?.announcements.length && (
                  <p className="py-4 text-sm text-muted-foreground">
                    {t("لا توجد إعلانات مخصصة لك حاليًا.", "There are no announcements for you yet.")}
                  </p>
                )}
                {feed.data?.announcements.map((announcement) => (
                  <article key={announcement.id} className={`py-4 ${announcement.read ? "opacity-75" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {announcement.category} · {fmtDate(announcement.published_at)}
                      </span>
                      <div className="flex items-center gap-2">
                        {!announcement.read && (
                          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">
                            {t("جديد", "New")}
                          </span>
                        )}
                        {announcement.pinned && (
                          <span className="rounded bg-warning-soft px-2 py-0.5 text-xs text-warning">
                            {t("مهم", "Important")}
                          </span>
                        )}
                      </div>
                    </div>
                    <h3 className="mt-2 font-bold">{announcement.title}</h3>
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
                      {announcement.body}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <Button size="sm" variant="link" className="h-auto px-0" asChild>
                        <Link to="/app/announcements">{t("عرض التفاصيل", "View details")}</Link>
                      </Button>
                      {!announcement.read && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => markAnnouncementRead(announcement.id)}
                        >
                          {t("تعليم كمقروء", "Mark as read")}
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <CalendarClock className="size-5 text-primary" /> {t("الامتحانات والمواعيد القادمة", "Upcoming exams and events")}
                </h2>
                <Link to="/app/schedule" className="text-sm text-primary">
                  {t("كل المواعيد", "All dates")}
                </Link>
              </div>
              <div className="rounded-xl border bg-card px-4">
                <ul className="divide-y">
                  {!feed.data?.events.length && (
                    <li className="py-3 text-sm text-muted-foreground">{t("لا توجد مواعيد قادمة.", "No upcoming events.")}</li>
                  )}
                  {feed.data?.events.map((event) => (
                    <li key={event.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="font-semibold">{event.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t(kindLabel[event.kind] ?? event.kind, { lecture: "Lecture", exam: "Exam", assignment: "Assignment", other: "Event" }[event.kind] ?? event.kind)}
                          {(event.subjects as { name: string } | null)?.name
                            ? ` · ${(event.subjects as { name: string }).name}`
                            : ""}
                        </p>
                      </div>
                      <time className="shrink-0 text-xs font-semibold text-primary">
                        {fmtDate(event.starts_at, true)}
                      </time>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <FileText className="size-5 text-primary" /> {t("أحدث المحاضرات", "Latest lectures")}
                </h2>
                <Link to="/app/subjects" className="text-sm text-primary">
                  {t("المواد", "Subjects")}
                </Link>
              </div>
              <div className="rounded-xl border bg-card px-4">
                <ul className="divide-y">
                  {!feed.data?.latestLectures.length && (
                    <li className="py-3 text-sm text-muted-foreground">
                      {t("لا توجد محاضرات جديدة بعد.", "No new lectures yet.")}
                    </li>
                  )}
                  {feed.data?.latestLectures.map((lecture) => (
                    <li key={lecture.id} className="flex min-w-0 items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{lecture.title}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {(lecture.subjects as { name: string } | null)?.name ?? t("مادة دراسية", "Subject")}
                          {lecture.week ? ` · الأسبوع ${lecture.week}` : ""}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" className="shrink-0" asChild>
                        <Link to="/app/subjects/$id" params={{ id: lecture.subject_id }}>
                          <BookOpen className="size-4" /> {t("فتح المادة", "Open subject")}
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Bell className="size-5 text-primary" /> {t("إشعاراتك", "Your notifications")}
                </h2>
                <Link to="/app/notifications" className="text-sm text-primary">
                  {t("كل الإشعارات", "All notifications")}
                </Link>
              </div>
              <div className="rounded-xl border bg-card px-4">
                <ul className="divide-y">
                  {!feed.data?.notifications.length && (
                    <li className="py-3 text-sm text-muted-foreground">{t("لا توجد إشعارات جديدة.", "No new notifications.")}</li>
                  )}
                  {feed.data?.notifications.map((notification) => (
                    <li
                      key={notification.id}
                      className="flex items-start justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {!notification.read && (
                            <span className="me-2 inline-block size-2 rounded-full bg-primary" />
                          )}
                          {notification.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {notification.body}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {fmtDate(notification.created_at, true)}
                        </p>
                      </div>
                      {!notification.read && (
                        <Button size="sm" variant="ghost" onClick={() => markRead(notification.id)}>
                          {t("مقروء", "Read")}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
