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

/** Broadcasts once to the configured group, independent of individual delivery preferences. */
export async function deliverTelegramGroup(admin: Admin, text: string) {
  const { data: group, error } = await admin
    .from("telegram_group_config")
    .select("chat_id")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("Could not load the Telegram group configuration", { code: error.code, message: error.message });
    return { groupSent: 0, groupFailed: 1, groupConfigured: false };
  }
  if (!group) return { groupSent: 0, groupFailed: 0, groupConfigured: false };

  try {
    const response = await tg("sendMessage", {
      chat_id: group.chat_id,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return {
      groupSent: response.ok ? 1 : 0,
      groupFailed: response.ok ? 0 : 1,
      groupConfigured: true,
    };
  } catch (deliveryError) {
    console.error("Telegram group delivery failed", deliveryError);
    return { groupSent: 0, groupFailed: 1, groupConfigured: true };
  }
}

/** Sends a Telegram message to linked users and records each delivery. */
export async function deliverTelegram(
  admin: Admin,
  userIds: string[],
  text: string,
  notificationId: string | null,
  groupText = text,
) {
  if (userIds.length === 0) {
    const group = await deliverTelegramGroup(admin, groupText);
    return { sent: 0, failed: 0, ...group };
  }
  const { data: links, error: linksError } = await admin
    .from("telegram_links")
    .select("user_id, chat_id, blocked")
    .in("user_id", userIds);
  if (linksError) {
    console.error("Could not load Telegram links", { code: linksError.code, message: linksError.message });
    const group = await deliverTelegramGroup(admin, groupText);
    return { sent: 0, failed: userIds.length, ...group };
  }

  let sent = 0, failed = 0;
  const linkedIds = new Set((links ?? []).map((link) => link.user_id));
  failed += userIds.filter((userId) => !linkedIds.has(userId)).length;
  failed += (links ?? []).filter((link) => link.blocked).length;

  await Promise.all((links ?? []).filter((link) => !link.blocked).map(async (link) => {
    let status: "sent" | "blocked" | "failed" = "failed";
    let errorText: string | null = null;
    let blocked = false;
    try {
      const response = await tg("sendMessage", {
        chat_id: link.chat_id,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      blocked = response.status === 403;
      status = response.ok ? "sent" : blocked ? "blocked" : "failed";
      errorText = response.ok ? null : response.description ?? "Telegram rejected the message";
    } catch (error) {
      errorText = error instanceof Error ? error.message : String(error);
      console.error("Telegram delivery failed", { userId: link.user_id, error: errorText });
    }

    if (status === "sent") sent += 1;
    else failed += 1;

    const { error: updateError } = await admin
      .from("telegram_links")
      .update({ last_send_status: status, last_send_at: new Date().toISOString(), blocked })
      .eq("user_id", link.user_id);
    if (updateError) console.error("Could not update Telegram delivery status", updateError);

    const { error: deliveryError } = await admin.from("telegram_deliveries").insert({
      user_id: link.user_id,
      notification_id: notificationId,
      status,
      error: errorText,
    });
    if (deliveryError) console.error("Could not record Telegram delivery", deliveryError);
  }));

  const group = await deliverTelegramGroup(admin, groupText);
  return { sent, failed, ...group };
}
