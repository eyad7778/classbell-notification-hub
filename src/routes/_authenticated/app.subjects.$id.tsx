import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Eye, File, FileText, Link2, Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useText } from "@/hooks/use-preferences";

export const Route = createFileRoute("/_authenticated/app/subjects/$id")({
  head: () => pageMeta("محاضرات المادة", "محاضرات وملفات ومواعيد المادة."),
  component: SubjectPage,
});

type Viewer = { title: string; url: string; kind: "frame" | "image" | "video" };

function inAppUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("رابط غير صالح");
  if (url.protocol === "http:") url.protocol = "https:";

  const host = url.hostname.toLowerCase();
  const driveId = url.pathname.match(/\/d\/([^/]+)/)?.[1] ?? url.searchParams.get("id");
  if (host === "drive.google.com" && driveId)
    return `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`;
  if (host === "docs.google.com" && driveId) {
    if (url.pathname.includes("/presentation/"))
      return `https://docs.google.com/presentation/d/${encodeURIComponent(driveId)}/embed`;
    if (url.pathname.includes("/spreadsheets/"))
      return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(driveId)}/preview`;
    return `https://docs.google.com/document/d/${encodeURIComponent(driveId)}/preview`;
  }
  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) {
    const videoId = host === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0]
      : url.searchParams.get("v") ?? url.pathname.match(/\/(?:embed|shorts)\/([^/]+)/)?.[1];
    if (videoId) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
  }
  if (host === "vimeo.com") {
    const videoId = url.pathname.split("/").filter(Boolean)[0];
    if (videoId && /^\d+$/.test(videoId)) return `https://player.vimeo.com/video/${videoId}`;
  }
  return url.toString();
}

function viewerKind(url: string): Viewer["kind"] {
  const pathname = new URL(url).pathname.toLowerCase();
  if (/\.(mp4|webm|ogv|mov)$/.test(pathname)) return "video";
  if (/\.(png|jpe?g|gif|webp|avif)$/.test(pathname)) return "image";
  return "frame";
}

function SubjectPage() {
  const { id } = Route.useParams();
  const me = useMe();
  const t = useText();
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [opening, setOpening] = useState(false);
  async function openInApp(title: string, url: string, storagePath?: string | null) {
    setOpening(true);
    try {
      let resolvedUrl = url;
      if (storagePath) {
        const { data, error } = await supabase.storage
          .from("lectures")
          .createSignedUrl(storagePath, 600);
        if (error || !data) throw new Error("تعذّر فتح الملف");
        resolvedUrl = data.signedUrl;
      } else {
        resolvedUrl = inAppUrl(url);
      }
      setViewer({ title, url: resolvedUrl, kind: viewerKind(resolvedUrl) });
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
      const lectureIds = (l.data ?? []).map((lecture) => lecture.id);
      const { data: resources } = lectureIds.length
        ? await supabase
            .from("lecture_resources")
            .select("*")
            .in("lecture_id", lectureIds)
            .order("created_at", { ascending: false })
        : { data: [] };
      return {
        subject: s.data,
        lectures: l.data ?? [],
        events: e.data ?? [],
        resources: resources ?? [],
      };
    },
  });
  if (me.isLoading) return <Loading />;
  if (!me.data?.hasAccess)
    return <AccessGate status={me.data?.status ?? "awaiting_payment"} linked={!!me.data?.tg} />;
  if (q.isLoading) return <Loading />;
  if (!q.data?.subject) return <ErrorBox text={t("المادة غير موجودة.", "Subject not found.")} />;
  const { subject, lectures, events, resources } = q.data;
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
      {lectures.length === 0 ? (
        <Empty title={t("لا توجد محاضرات بعد", "No lectures yet")} />
      ) : (
        <div className="space-y-3">
          {lectures.map((l) => (
            <Card key={l.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold">
                    {l.week ? `الأسبوع ${l.week} · ` : ""}
                    {l.title}
                  </p>
                  {l.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{l.description}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {l.file_path && (
                    <Button size="sm" disabled={opening} onClick={() => void openInApp(l.title, "", l.file_path)}>
                      {opening ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                      {t("فتح المحاضرة", "Open lecture")}
                    </Button>
                  )}
                  {l.external_url && (
                    <Button size="sm" variant="outline" disabled={opening} onClick={() => void openInApp(l.title, l.external_url!)}>
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
                        <Button size="sm" variant="outline" disabled={opening} onClick={() => void openInApp(resource.name, resource.url)}>
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
      <Dialog open={!!viewer} onOpenChange={(open) => { if (!open) setViewer(null); }}>
        <DialogContent className="flex h-[92dvh] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-3 overflow-hidden p-3 sm:p-5">
          <DialogHeader className="shrink-0 pe-8 text-start">
            <DialogTitle>{viewer?.title}</DialogTitle>
            <DialogDescription>يُعرض المحتوى داخل التطبيق. قد تمنع بعض المواقع تضمين صفحاتها.</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-black/90">
            {viewer?.kind === "image" ? (
              <img src={viewer.url} alt={viewer.title} className="h-full w-full object-contain" />
            ) : viewer?.kind === "video" ? (
              <video src={viewer.url} controls playsInline className="h-full w-full object-contain" />
            ) : viewer ? (
              <iframe
                key={viewer.url}
                src={viewer.url}
                title={viewer.title}
                className="h-full w-full border-0 bg-background"
                sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
                referrerPolicy="no-referrer"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
