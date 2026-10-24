import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CHANGE_ACTIONS, type Change, type ChangeAction } from "@/lib/schedule-changes";
import { useText } from "@/hooks/use-preferences";

export function useScheduleChanges(userId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["schedule-changes", userId], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("class_schedule_changes")
        .select("*, class_schedule(subjects(name))").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });
}

export function asChanges(rows: { scope: string; action: string; session_id: string; change_date: string; new_date: string | null; new_starts_at: string | null; new_ends_at: string | null; new_location: string | null; new_instructor: string | null; reason: string | null; created_at: string }[]): Change[] {
  return rows.filter((r) => (r.scope === "once" || r.scope === "onwards") && CHANGE_ACTIONS.some((a) => a.id === r.action))
    .map((r) => ({ ...r, scope: r.scope as Change["scope"], action: r.action as ChangeAction }));
}

export function ScheduleUpdates({ userId, enabled, limit = 5 }: { userId: string | undefined; enabled: boolean; limit?: number }) {
  const q = useScheduleChanges(userId, enabled);
  const t = useText();
  if (!enabled) return null;
  return <section className="mb-6">
    <h2 className="mb-3 text-lg font-bold">{t("آخر تحديثات الجدول", "Latest timetable changes")}</h2>
    {q.isError ? <p role="alert" className="text-sm text-destructive">{t("تعذّر تحميل تعديلات الجدول", "Could not load timetable changes")}</p> : q.isPending ? <p className="text-sm text-muted-foreground">{t("جارٍ التحميل…", "Loading…")}</p> : !q.data.length ? <p className="text-sm text-muted-foreground">{t("لا توجد تعديلات", "No changes")}</p> :
    <ul className="divide-y border-y">{q.data.slice(0, limit).map((c) => <li key={c.id} className="py-3">
      <p className="font-medium">{c.class_schedule?.subjects?.name} · {CHANGE_ACTIONS.find((a) => a.id === c.action)?.label} · {c.change_date}{c.scope === "onwards" ? t(" — والمواعيد القادمة", " — and future classes") : ""}</p>
      <p className="mt-1 text-sm text-muted-foreground">{[c.new_date, c.new_starts_at?.slice(0,5), c.new_location, c.new_instructor, c.reason].filter(Boolean).join(" · ")}</p>
      <time className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</time>
    </li>)}</ul>}
  </section>;
}