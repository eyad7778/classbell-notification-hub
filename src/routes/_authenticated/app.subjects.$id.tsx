import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ExternalLink, FileDown } from "lucide-react";
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
import { useText } from "@/hooks/use-preferences";

export const Route = createFileRoute("/_authenticated/app/subjects/$id")({
  head: () => pageMeta("محاضرات المادة", "محاضرات وملفات ومواعيد المادة."),
  component: SubjectPage,
});

export async function openFile(path: string) {
  const { data, error } = await supabase.storage.from("lectures").createSignedUrl(path, 300);
  if (error || !data) {
    toast.error("تعذّر فتح الملف");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

function SubjectPage() {
  const { id } = Route.useParams();
  const me = useMe();
  const t = useText();
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
          .order("week", { nullsFirst: false })
          .order("created_at"),
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
                    <Button size="sm" onClick={() => openFile(l.file_path!)}>
                      <FileDown className="size-4" /> {t("الملف", "File")}
                    </Button>
                  )}
                  {l.external_url && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={l.external_url} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-4" /> {t("رابط", "Link")}
                      </a>
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
                        <span>
                          <b>{resource.name}</b>
                          {resource.description && (
                            <span className="ms-2 text-xs text-muted-foreground">
                              {resource.description}
                            </span>
                          )}
                        </span>
                        <Button size="sm" variant="outline" asChild>
                          <a href={resource.url} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-4" />
                            {resource.resource_type === "video"
                              ? t("مشاهدة الفيديو", "Watch video")
                              : resource.resource_type === "pdf"
                                ? t("عرض الملف", "View file")
                                : t("فتح المورد", "Open resource")}
                          </a>
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
