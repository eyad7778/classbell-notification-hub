import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { Card, Empty, fmtDate, Loading, PageTitle } from "@/components/app-ui";
import { pageMeta } from "@/lib/meta";
import { useText } from "@/hooks/use-preferences";

export const Route = createFileRoute("/_authenticated/app/notifications")({
  head: () => pageMeta("الإشعارات", "كل الإشعارات التي وصلتك."),
  component: Notifications,
});

function Notifications() {
  const me = useMe();
  const t = useText();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications"],
    enabled: !!me.data,
    queryFn: async () => {
      const [n, r] = await Promise.all([
        supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("notification_reads").select("notification_id"),
      ]);
      const read = new Set((r.data ?? []).map((x) => x.notification_id));
      return (n.data ?? []).map((x) => ({ ...x, read: read.has(x.id) }));
    },
  });
  async function markAll() {
    const unread = (q.data ?? []).filter((x) => !x.read);
    if (!unread.length || !me.data) return;
    await supabase.from("notification_reads").upsert(unread.map((x) => ({ notification_id: x.id, user_id: me.data!.id })), { onConflict: "notification_id,user_id", ignoreDuplicates: true });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["unread"] });
  }
  if (q.isLoading || me.isLoading) return <Loading />;
  const list = q.data ?? [];
  return (
    <div>
      <PageTitle title={t("الإشعارات", "Notifications")} action={list.some((x) => !x.read) && <Button variant="outline" size="sm" onClick={markAll}>{t("تعليم الكل كمقروء", "Mark all as read")}</Button>} />
      {list.length === 0 ? <Empty title={t("لا توجد إشعارات", "No notifications yet")} /> : (
        <div className="space-y-2">
          {list.map((n) => (
            <Card key={n.id} className={n.read ? "opacity-70" : "border-primary"}>
              <div className="flex justify-between gap-2">
                <p className="font-bold">{!n.read && <span className="ms-0 me-2 inline-block size-2 rounded-full bg-primary" />}{n.title}</p>
                <span className="text-xs text-muted-foreground">{fmtDate(n.created_at, true)}</span>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm">{n.body}</p>
              {n.link?.startsWith("/app") && <Link to={n.link} className="mt-2 inline-block text-sm text-primary">{t("عرض", "Open")}</Link>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
