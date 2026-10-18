import { createFileRoute } from "@tanstack/react-router";
import { sha256Hex, tg, webhookSecret } from "@/lib/telegram.server";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = await webhookSecret();
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) return new Response("Unauthorized", { status: 401 });

        const update = (await request.json().catch(() => null)) as {
          message?: { text?: string; chat?: { id: number; type: string }; from?: { id: number; username?: string } };
        } | null;
        const msg = update?.message;
        if (!msg?.chat?.id || !msg.from?.id || msg.chat.type !== "private") return Response.json({ ok: true });

        const text = (msg.text ?? "").trim();
        const chatId = msg.chat.id;
        const reply = (t: string) => tg("sendMessage", { chat_id: chatId, text: t });
        const m = text.match(/^\/start(?:\s+([A-Za-z0-9_-]{20,64}))?$/);
        if (!m) {
          await reply("مرحبًا 👋 هذا بوت إشعارات Smart Student. لربط حسابك افتح صفحة «ربط Telegram» داخل التطبيق واضغط زر الربط.");
          return Response.json({ ok: true });
        }
        if (!m[1]) {
          await reply("لإتمام الربط يجب فتح البوت من زر «ربط حساب Telegram» داخل التطبيق، فالضغط على Start وحده لا يكفي.");
          return Response.json({ ok: true });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const hash = await sha256Hex(m[1]);
        // Atomic single-use consumption
        const { data: tok, error: tokenError } = await supabaseAdmin
          .from("telegram_link_tokens")
          .update({ used_at: new Date().toISOString() })
          .eq("token_hash", hash)
          .is("used_at", null)
          .gt("expires_at", new Date().toISOString())
          .select("user_id")
          .maybeSingle();
        if (tokenError) {
          console.error("Telegram token lookup failed", { code: tokenError.code, message: tokenError.message });
          return Response.json({ error: "Telegram link storage unavailable" }, { status: 503 });
        }
        if (!tok) {
          await reply("رمز الربط غير صالح أو منتهي أو مستخدم من قبل. ارجع للتطبيق واضغط «ربط حساب Telegram» مرة أخرى.");
          return Response.json({ ok: true });
        }

        const { data: other } = await supabaseAdmin.from("telegram_links").select("user_id").eq("telegram_user_id", msg.from.id).maybeSingle();
        if (other && other.user_id !== tok.user_id) {
          await reply("حساب Telegram هذا مرتبط بحساب طالب آخر. تواصل مع الدعم إذا كان هذا خطأ.");
          return Response.json({ ok: true });
        }

        const { error } = await supabaseAdmin.from("telegram_links").upsert({
          user_id: tok.user_id,
          telegram_user_id: msg.from.id,
          chat_id: msg.chat.id,
          telegram_username: msg.from.username ?? null,
          linked_at: new Date().toISOString(),
          blocked: false,
        });
        if (error) {
          console.error("link failed", error);
          await reply("حدث خطأ أثناء الربط، حاول مرة أخرى بعد قليل.");
          return Response.json({ ok: true });
        }
        await reply("✅ تم ربط حسابك بنجاح! ستصلك إشعارات Smart Student هنا. يمكنك العودة للتطبيق الآن.");
        return Response.json({ ok: true });
      },
    },
  },
});
