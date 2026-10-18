import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createTelegramLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
      console.error("Telegram linking is missing SUPABASE_SERVICE_ROLE_KEY");
      return { error: "خدمة ربط Telegram غير مكتملة الإعداد على الخادم. تواصل مع الإدارة." };
    }
    if (!process.env["TELEGRAM_API_KEY"]) {
      console.error("Telegram linking is missing TELEGRAM_API_KEY");
      return { error: "بوت Telegram غير مهيأ على الخادم. تواصل مع الإدارة." };
    }
    const { sha256Hex, botUsername } = await import("@/lib/telegram.server");
    const { data: sub } = await context.supabase.from("subscriptions").select("status, end_at").eq("user_id", context.userId).maybeSingle();
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    const active = sub?.status === "active" && (!sub.end_at || new Date(sub.end_at) > new Date());
    if (!active && !staff) return { error: "يجب تفعيل الاشتراك أولًا قبل ربط Telegram." };

    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("telegram_link_tokens").delete().eq("user_id", context.userId).is("used_at", null);
    const { error } = await supabaseAdmin.from("telegram_link_tokens").insert({
      token_hash: await sha256Hex(token),
      user_id: context.userId,
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    if (error) return { error: "تعذّر إنشاء رمز الربط، حاول مرة أخرى." };
    try {
      const bot = await botUsername();
      return { url: `https://t.me/${bot}?start=${token}`, bot };
    } catch {
      return { error: "بوت Telegram غير متاح حاليًا. تواصل مع الإدارة." };
    }
  });
