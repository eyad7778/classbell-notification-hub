import { escapeHtml, tg } from "@/lib/telegram.server";

type Admin = typeof import("@/integrations/supabase/client.server")["supabaseAdmin"];

/** Sends an activity alert to every owner with a linked Telegram account. Never throws. */
export async function alertOwners(admin: Admin, title: string, lines: Array<string | null | undefined>) {
  try {
    const { data: owners, error } = await admin.from("user_roles").select("user_id").eq("role", "owner");
    if (error || !owners?.length) return;
    const { data: links } = await admin
      .from("telegram_links")
      .select("chat_id")
      .in("user_id", owners.map((o) => o.user_id))
      .eq("blocked", false);
    if (!links?.length) return;
    const body = lines.filter(Boolean).map((l) => escapeHtml(String(l))).join("\n");
    const text = `<b>${escapeHtml(title)}</b>\n${body}`;
    await Promise.all(
      links.map((l) => tg("sendMessage", { chat_id: l.chat_id, text, parse_mode: "HTML", disable_web_page_preview: true })),
    );
  } catch (e) {
    console.error("Owner Telegram alert failed", e);
  }
}

export async function studentLabel(admin: Admin, userId: string) {
  const { data } = await admin
    .from("profiles")
    .select("full_name, phone, level, student_code")
    .eq("id", userId)
    .maybeSingle();
  return [
    `الاسم: ${data?.full_name ?? "—"}`,
    `الهاتف: ${data?.phone ?? "—"}`,
    data?.level ? `الفرقة: ${data.level}` : null,
    data?.student_code ? `الكود: ${data.student_code}` : null,
  ];
}
