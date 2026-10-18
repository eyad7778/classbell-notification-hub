import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { AccessGate, Card, Empty, ErrorBox, Loading, PageTitle } from "@/components/app-ui";
import { pageMeta } from "@/lib/meta";
import { useText } from "@/hooks/use-preferences";

export const Route = createFileRoute("/_authenticated/app/subjects")({
  head: () => pageMeta("المواد", "المواد الدراسية ومحاضراتها وملفاتها."),
  component: Subjects,
});

function Subjects() {
  const me = useMe();
  const t = useText();
  const q = useQuery({
    queryKey: ["subjects"],
    enabled: !!me.data?.hasAccess,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("*, lectures(count)")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  if (me.isLoading) return <Loading />;
  if (!me.data?.hasAccess) return <AccessGate status={me.data?.status ?? "awaiting_payment"} linked={!!me.data?.tg} />;
  if (q.isLoading) return <Loading />;
  if (q.isError) return (
    <div>
      <ErrorBox text="تعذّر تحميل المواد الدراسية. تحقق من الاتصال ثم أعد المحاولة." />
      <Button className="mt-3" variant="outline" onClick={() => void q.refetch()}>
        إعادة تحميل المواد
      </Button>
    </div>
  );
  const list = q.data ?? [];
  return (
    <div>
      <PageTitle title={t("المواد الدراسية", "Subjects")} subtitle={t("اختر مادة لعرض محاضراتها وملفاتها.", "Choose a subject to view its lectures and files.")} />
      {list.length === 0 ? <Empty title={t("لا توجد مواد بعد", "No subjects yet")} /> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((s) => (
            <Link
              key={s.id}
              to="/app/subjects/$id"
              params={{ id: s.id }}
              aria-label={`${t("افتح محاضرات مادة", "Open lectures for")} ${s.name}`}
              className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Card className="h-full cursor-pointer transition hover:border-primary group-hover:border-primary group-focus-visible:border-primary">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"><BookOpen className="size-5" /></span>
                  <div>
                    <p className="font-bold">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{[s.code, s.level, s.term].filter(Boolean).join(" · ")}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{(s.lectures as unknown as { count: number }[])?.[0]?.count ?? 0} {t("محاضرة", "lectures")}</p>
                    <p className="mt-2 text-xs font-semibold text-primary">{t("اضغط لعرض المحاضرات ←", "Open lectures →")}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
