import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SubStatus =
  "pending" | "awaiting_payment" | "active" | "expired" | "suspended" | "rejected";

export const statusLabel: Record<SubStatus, { text: string; cls: string }> = {
  pending: { text: "قيد المراجعة", cls: "bg-warning-soft text-warning" },
  awaiting_payment: { text: "بانتظار الدفع", cls: "bg-warning-soft text-warning" },
  active: { text: "مفعّل", cls: "bg-success-soft text-success" },
  expired: { text: "منتهي", cls: "bg-destructive/10 text-destructive" },
  suspended: { text: "موقوف", cls: "bg-destructive/10 text-destructive" },
  rejected: { text: "مرفوض", cls: "bg-destructive/10 text-destructive" },
};

export function effectiveStatus(
  s: { status: SubStatus; end_at: string | null } | null | undefined,
): SubStatus {
  if (!s) return "awaiting_payment";
  if (s.status === "active" && s.end_at && new Date(s.end_at) <= new Date()) return "expired";
  return s.status;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const id = u.user?.id;
      if (!id) throw new Error("not signed in");
      const [p, s, t, r, staffPermissions] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, phone, level, department_id, student_code, registration_status, id_card_path")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("subscriptions")
          .select("status, end_at, start_at")
          .eq("user_id", id)
          .maybeSingle(),
        supabase
          .from("telegram_links")
          .select("linked_at, blocked, last_send_status, last_send_at, telegram_username")
          .eq("user_id", id)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", id),
        supabase.from("staff_permissions").select("permission").eq("user_id", id),
      ]);
      const roles = (r.data ?? []).map((x) => x.role);
      const permissions = (staffPermissions.data ?? []).map((x) => x.permission);
      const isStaff = roles.includes("owner") || roles.includes("staff");
      const status = effectiveStatus(s.data as never);
      return {
        id,
        profile: p.data,
        sub: s.data,
        status,
        tg: t.data,
        roles,
        permissions,
        isStaff,
        isOwner: roles.includes("owner"),
        hasAccess: isStaff || (p.data?.registration_status === "active" && status === "active" && !!t.data),
      };
    },
  });
}
