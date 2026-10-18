import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyPushStorageError } from "@/lib/push-errors";

export const getPushConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getVapidPublicKey } = await import("@/lib/push.server");
    return { publicKey: getVapidPublicKey() };
  });

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) =>
    z.object({
      endpoint: z.string().url().max(2048),
      keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(10).max(100) }),
    }).parse(value),
  )
  .handler(async ({ data, context }) => {
    if (new URL(data.endpoint).protocol !== "https:") throw new Error("Invalid push endpoint");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error, status } = await supabaseAdmin.from("push_subscriptions").upsert({
      user_id: context.userId,
      endpoint: data.endpoint,
      p256dh: data.keys.p256dh,
      auth: data.keys.auth,
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    if (error) {
      const reason = classifyPushStorageError({ code: error.code, message: error.message, status });
      console.error("Push subscription save failed", { reason, code: error.code, status });
      throw new Error(reason);
    }
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => z.object({ endpoint: z.string().url().max(2048) }).parse(value))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error, status } = await supabaseAdmin.from("push_subscriptions").delete()
      .eq("user_id", context.userId)
      .eq("endpoint", data.endpoint);
    if (error) {
      const reason = classifyPushStorageError({ code: error.code, message: error.message, status });
      console.error("Push subscription removal failed", { reason, code: error.code, status });
      throw new Error(reason);
    }
    return { ok: true };
  });
