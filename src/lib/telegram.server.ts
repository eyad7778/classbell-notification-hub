const TELEGRAM_API = "https://api.telegram.org/bot";

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256B64Url(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function webhookSecret(): Promise<string> {
  const key = process.env["TELEGRAM_API_KEY"];
  if (!key) throw new Error("TELEGRAM_API_KEY is not configured");
  return sha256B64Url(`telegram-webhook:${key}`);
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<{ ok: boolean; status: number; result?: T | undefined; description?: string | undefined }> {
  const key = process.env["TELEGRAM_API_KEY"];
  if (!key) throw new Error("TELEGRAM_API_KEY is not configured");
  const res = await fetch(`${TELEGRAM_API}${key}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: { ok?: boolean; result?: T; description?: string } = {};
  try { json = JSON.parse(text); } catch { /* non-json */ }
  if (!res.ok || !json.ok) console.error(`Telegram ${method} failed [${res.status}]: ${text}`);
  return { ok: res.ok && !!json.ok, status: res.status, result: json.result, description: json.description ?? text.slice(0, 200) };
}

let cachedBot: string | null = null;
export async function botUsername(): Promise<string> {
  if (cachedBot) return cachedBot;
  const r = await tg<{ username: string }>("getMe");
  if (!r.ok || !r.result) throw new Error("تعذّر الوصول إلى بوت Telegram");
  cachedBot = r.result.username;
  return cachedBot;
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type Admin = typeof import("@/integrations/supabase/client.server")["supabaseAdmin"];

/** Sends a Telegram message to linked users and records each delivery. */
export async function deliverTelegram(admin: Admin, userIds: string[], text: string, notificationId: string | null) {
  if (userIds.length === 0) return { sent: 0, failed: 0 };
  const { data: links } = await admin.from("telegram_links").select("user_id, chat_id, blocked").in("user_id", userIds);
  let sent = 0, failed = 0;
  for (const l of links ?? []) {
    const r = await tg("sendMessage", { chat_id: l.chat_id, text, parse_mode: "HTML", disable_web_page_preview: true });
    const blocked = r.status === 403;
    const status = r.ok ? "sent" : blocked ? "blocked" : "failed";
    r.ok ? sent++ : failed++;
    await admin.from("telegram_links").update({ last_send_status: status, last_send_at: new Date().toISOString(), blocked }).eq("user_id", l.user_id);
    await admin.from("telegram_deliveries").insert({ user_id: l.user_id, notification_id: notificationId, status, error: r.ok ? null : r.description ?? null });
  }
  return { sent, failed };
}
