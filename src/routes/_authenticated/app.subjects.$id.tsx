import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, File, FileText, Link2, Loader2, Video, X } from "lucide-react";
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
import { contentTarget, viewerKind, type ViewerKind } from "@/lib/lecture-links";
import { useText } from "@/hooks/use-preferences";

export const Route = createFileRoute("/_authenticated/app/subjects/$id")({
  head: () => pageMeta("محاضرات المادة", "محاضرات وملفات ومواعيد المادة."),
  component: SubjectPage,
});

type Viewer = { title: string; url: string; fallbackUrl: string; kind: ViewerKind };

function SubjectPage() {
  const { id } = Route.useParams();
  const me = useMe();
  const t = useText();
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [opening, setOpening] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!viewer) return;
    viewerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [viewer]);
  async function openContent(title: string, url: string, storagePath?: string | null) {
    setOpening(true);
    try {
      if (storagePath) {
        const { data, error } = await supabase.storage
          .from("lectures")
          .createSignedUrl(storagePath, 600);
        if (error || !data) throw new Error("تعذّر فتح الملف");
        setViewer({ title, url: data.signedUrl, fallbackUrl: data.signedUrl, kind: viewerKind(data.signedUrl) });
        return;
      }
      const target = contentTarget(url);
      if (target.action === "external") {
        window.open(target.url, "_blank", "noopener,noreferrer");
        return;
      }
      setViewer({ title, url: target.url, fallbackUrl: url, kind: target.kind });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر فتح المحتوى داخل التطبيق");
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
                    <Button size="sm" disabled={opening} onClick={() => void openContent(l.title, "", l.file_path)}>
                      {opening ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                      {t("فتح المحاضرة", "Open lecture")}
                    </Button>
                  )}
                  {l.external_url && (
                    <Button size="sm" variant="outline" disabled={opening} onClick={() => void openContent(l.title, l.external_url!)}>
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
                        <Button size="sm" variant="outline" disabled={opening} onClick={() => void openContent(resource.name, resource.url)}>
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
      {viewer && (
        <div ref={viewerRef} className="mt-4 scroll-mt-20">
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("المحتوى مفتوح داخل التطبيق", "Content opened in the app")}</p>
              <h2 className="truncate font-bold">{viewer.title}</h2>
            </div>
            <Button variant="outline" size="icon" aria-label={t("إغلاق المحاضرة", "Close lecture")} onClick={() => setViewer(null)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="min-h-[55dvh] overflow-hidden rounded-lg border bg-muted sm:min-h-[70dvh]">
            {viewer.kind === "image" ? (
              <img src={viewer.url} alt={viewer.title} className="h-full max-h-[75dvh] w-full object-contain" />
            ) : viewer.kind === "video" ? (
              <video src={viewer.url} controls playsInline className="h-full max-h-[75dvh] w-full bg-black object-contain" />
            ) : (
              <iframe
                key={viewer.url}
                src={viewer.url}
                title={viewer.title}
                className="h-[55dvh] w-full border-0 bg-background sm:h-[70dvh]"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
                referrerPolicy="no-referrer"
              />
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("إذا لم يعرض الموقع المحتوى، فقد لا يسمح بفتحه داخل صفحات أخرى.", "Some providers block displaying content inside other pages.")}
          </p>
          <a href={viewer.fallbackUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-sm font-semibold text-primary underline">
            {t("فتح المحتوى في تبويب جديد", "Open content in a new tab")}
          </a>
        </Card>
        </div>
      )}
    </div>
  );
}
