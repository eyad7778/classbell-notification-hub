import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Eye, File, FileText, Link2, Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import {
  AccessGate,
  Card,
  Empty,
  ErrorBox,
  fmtDate,
  kindLabel,
  Loading,
  PageTitle,
} from "@/components/app-ui";
import { pageMeta } from "@/lib/meta";
import { contentTarget } from "@/lib/lecture-links";
import { useText } from "@/hooks/use-preferences";
import { QuickAddLectures } from "@/components/quick-add-lectures";

export const Route = createFileRoute("/_authenticated/app/subjects/$id")({
  head: () => pageMeta("محاضرات المادة", "محاضرات وملفات ومواعيد المادة."),
  component: SubjectPage,
});

function SubjectPage() {
  const { id } = Route.useParams();
  const me = useMe();
  const t = useText();
  const [opening, setOpening] = useState(false);
  async function openContent(url: string, storagePath?: string | null) {
    setOpening(true);
    let popup: Window | null = null;
    try {
      if (storagePath) {
        popup = window.open("about:blank", "_blank");
        if (!popup) throw new Error("اسمح بفتح النوافذ المنبثقة لفتح الملف.");
        popup.opener = null;
        const { data, error } = await supabase.storage
          .from("lectures")
          .createSignedUrl(storagePath, 600);
        if (error || !data) throw new Error("تعذّر فتح الملف");
        popup.location.replace(data.signedUrl);
        return;
      }
      const target = contentTarget(url);
      const destination = target.action === "external"
        ? target.url
        : /^[a-z][a-z\d+.-]*:\/\//i.test(url.trim())
          ? url.trim()
          : `https://${url.trim()}`;
      window.open(destination, "_blank", "noopener,noreferrer");
    } catch (error) {
      popup?.close();
      toast.error(error instanceof Error ? error.message : "تعذّر فتح المحتوى في المتصفح");
    } finally {
      setOpening(false);
    }
  }
  const q = useQuery({
    queryKey: ["subject", id],
    enabled: !!me.data?.hasAccess,
    queryFn: async () => {
      const [s, l, e] = await Promise.all([
        supabase.from("subjects").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("lectures")
          .select("*")
          .eq("subject_id", id)
          .order("week", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true })
          .order("title", { ascending: true }),
        supabase
          .from("events")
          .select("*")
          .eq("subject_id", id)
          .gte("starts_at", new Date().toISOString())
          .order("starts_at"),
      ]);
      if (s.error) throw s.error;
      if (l.error) throw l.error;
      const lectureIds = (l.data ?? []).map((lecture) => lecture.id);
      const { data: resources, error: resourceError } = lectureIds.length
        ? await supabase
            .from("lecture_resources")
            .select("*")
            .in("lecture_id", lectureIds)
            .order("created_at", { ascending: false })
        : { data: [], error: null };
      return {
        subject: s.data,
        lectures: l.data ?? [],
        events: e.data ?? [],
        resources: resources ?? [],
        resourcesFailed: !!resourceError,
      };
    },
  });
  if (me.isLoading) return <Loading />;
  if (!me.data?.hasAccess)
    return <AccessGate status={me.data?.status ?? "awaiting_payment"} linked={!!me.data?.tg} />;
  if (q.isLoading) return <Loading />;
  if (q.isError)
    return (
      <div>
        <ErrorBox text="تعذّر تحميل محاضرات المادة. تحقق من اتصالك ثم أعد المحاولة." />
        <Button className="mt-3" variant="outline" onClick={() => void q.refetch()}>
          إعادة تحميل المحاضرات
        </Button>
      </div>
    );
  if (!q.data?.subject) return <ErrorBox text={t("المادة غير موجودة.", "Subject not found.")} />;
  const { subject, lectures, events, resources, resourcesFailed } = q.data;
  return (
    <div>
      <Link
        to="/app/subjects"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowRight className="size-4" /> {t("كل المواد", "All subjects")}
      </Link>
      <PageTitle
        title={subject.name}
        {...(subject.description ? { subtitle: subject.description } : {})}
      />
      {events.length > 0 && (
        <Card className="mb-4">
          <h2 className="font-bold">{t("مواعيد قادمة", "Upcoming events")}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {events.map((e) => (
              <li key={e.id}>
                {t(kindLabel[e.kind] ?? e.kind, { lecture: "Lecture", exam: "Exam", assignment: "Assignment", other: "Event" }[e.kind] ?? e.kind)}: {e.title} · {fmtDate(e.starts_at, true)}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {me.data?.isStaff && (
        <Card className="mb-4">
          <h2 className="mb-2 font-bold">إضافة محاضرات لهذه المادة</h2>
          <QuickAddLectures subjectId={id} />
        </Card>
      )}
      {resourcesFailed && (
        <ErrorBox text="ظهرت المحاضرات، لكن تعذّر تحميل روابط بعض الملفات. أعد تحميل الصفحة للمحاولة مجددًا." />
      )}
      {lectures.length === 0 ? (
        <Empty title={t("لا توجد محاضرات بعد", "No lectures yet")} />
      ) : (
        <div className="space-y-3">
          {lectures.map((l) => (
            <Card key={l.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold">
                    {l.week ? `المحاضرة ${l.week} · ` : ""}
                    {l.title}
                  </p>
                  {l.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{l.description}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {l.file_path && (
                    <Button size="sm" disabled={opening} onClick={() => void openContent("", l.file_path)}>
                      {opening ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                      {t("فتح المحاضرة", "Open lecture")}
                    </Button>
                  )}
                  {l.external_url && (
                    <Button size="sm" variant="outline" disabled={opening} onClick={() => void openContent(l.external_url!)}>
                      {opening ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                      {t("فتح المحاضرة", "Open lecture")}
                    </Button>
                  )}
                </div>
              </div>
              {resources.filter((resource) => resource.lecture_id === l.id).length > 0 && (
                <ul className="mt-3 space-y-2 border-t pt-3">
                  {resources
                    .filter((resource) => resource.lecture_id === l.id)
                    .map((resource) => (
                      <li
                        key={resource.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {resource.resource_type === "video" ? (
                            <Video className="size-4 shrink-0 text-primary" />
                          ) : resource.resource_type === "pdf" ? (
                            <FileText className="size-4 shrink-0 text-primary" />
                          ) : resource.resource_type === "external" ? (
                            <Link2 className="size-4 shrink-0 text-primary" />
                          ) : (
                            <File className="size-4 shrink-0 text-primary" />
                          )}
                          <span className="min-w-0 truncate">
                          <b>{resource.name}</b>
                          {resource.description && (
                            <span className="ms-2 text-xs text-muted-foreground">
                              {resource.description}
                            </span>
                          )}
                          </span>
                        </span>
                        <Button size="sm" variant="outline" disabled={opening} onClick={() => void openContent(resource.url)}>
                          {opening ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                          {resource.resource_type === "video"
                            ? t("مشاهدة الفيديو", "Watch video")
                            : resource.resource_type === "pdf"
                              ? t("عرض الملف", "View file")
                              : t("فتح المورد", "Open resource")}
                        </Button>
                      </li>
                    ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
