import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Pin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { AccessGate, Card, Empty, fmtDate, Loading, PageTitle } from "@/components/app-ui";
import { pageMeta } from "@/lib/meta";
import { useText } from "@/hooks/use-preferences";

export const Route = createFileRoute("/_authenticated/app/announcements")({
  head: () => pageMeta("الإعلانات", "آخر إعلانات الإدارة والدفعة."),
  component: Announcements,
});

function Announcements() {
  const me = useMe();
  const t = useText();
  const q = useQuery({
    queryKey: ["announcements"],
    enabled: !!me.data?.hasAccess,
    queryFn: async () => {
      const [announcements, reads] = await Promise.all([
        supabase
          .from("announcements")
          .select("*")
          .order("pinned", { ascending: false })
          .order("published_at", { ascending: false })
          .limit(100),
        supabase.from("announcement_reads").select("announcement_id"),
      ]);
      const readIds = new Set((reads.data ?? []).map((item) => item.announcement_id));
      return (announcements.data ?? []).map((item) => ({ ...item, read: readIds.has(item.id) }));
    },
  });
  async function markRead(id: string) {
    if (!me.data) return;
    const { error } = await supabase
      .from("announcement_reads")
      .upsert(
        { announcement_id: id, user_id: me.data.id },
        { onConflict: "announcement_id,user_id", ignoreDuplicates: true },
      );
    if (error) toast.error(t("تعذّر تحديث الإعلان", "Could not update the announcement"));
    else await q.refetch();
  }
  if (me.isLoading) return <Loading />;
  if (!me.data?.hasAccess)
    return <AccessGate status={me.data?.status ?? "awaiting_payment"} linked={!!me.data?.tg} />;
  if (q.isLoading) return <Loading />;
  return (
    <div>
      <PageTitle title={t("الإعلانات", "Announcements")} />
      {(q.data ?? []).length === 0 ? (
        <Empty title={t("لا توجد إعلانات", "No announcements yet")} />
      ) : (
        <div className="space-y-3">
          {q.data!.map((a) => (
            <Card
              key={a.id}
              className={`${a.pinned ? "border-primary" : ""} ${a.read ? "opacity-75" : ""}`}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {a.pinned && <Pin className="size-3.5 text-primary" />}
                <span className="rounded-full bg-muted px-2 py-0.5">{a.category}</span>
                <span>{fmtDate(a.published_at)}</span>
                <span className="ms-auto">{a.read ? t("مقروء", "Read") : t("غير مقروء", "Unread")}</span>
              </div>
              <h2 className="mt-2 font-bold">{a.title}</h2>
              <p className="mt-1 whitespace-pre-line text-sm leading-7">{a.body}</p>
              {!a.read && (
                <Button className="mt-2" size="sm" variant="outline" onClick={() => markRead(a.id)}>
                  {t("تعليم كمقروء", "Mark as read")}
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
