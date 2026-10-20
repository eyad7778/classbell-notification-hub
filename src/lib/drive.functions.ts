import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

type Ctx = {
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }> };
  userId: string;
};

async function assertContentStaff(ctx: Ctx) {
  const { data: isOwner } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "owner" });
  if (isOwner) return;
  const { data } = await ctx.supabase.rpc("has_staff_permission", { _user_id: ctx.userId, _permission: "content" });
  if (!data) throw new Error("غير مصرح لك برفع المحاضرات");
}

function headers(extra: Record<string, string> = {}) {
  const lovable = process.env["LOVABLE_API_KEY"];
  const drive = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovable || !drive) throw new Error("ربط Google Drive غير مضبوط على الخادم");
  return { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": drive, ...extra };
}

/** Starts a resumable Drive upload; the browser then sends the file bytes straight to Google. */
export const startDriveUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().min(1).max(200),
      mimeType: z.string().max(120),
      size: z.number().int().positive().max(5 * 1024 ** 3),
      origin: z.string().url(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertContentStaff(context as unknown as Ctx);
    const res = await fetch(`${GATEWAY}/upload/drive/v3/files?uploadType=resumable&fields=id`, {
      method: "POST",
      headers: headers({
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": data.mimeType || "application/octet-stream",
        "X-Upload-Content-Length": String(data.size),
        Origin: data.origin,
      }),
      body: JSON.stringify({ name: data.name }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Drive upload start failed [${res.status}]: ${body}`);
      throw new Error(`تعذّر بدء الرفع على Drive (${res.status})`);
    }
    const uploadUrl = res.headers.get("location") ?? res.headers.get("Location");
    if (!uploadUrl) throw new Error("لم يرجع Drive رابط الرفع");
    return { uploadUrl };
  });

/** Makes the uploaded file viewable by link and returns its URL. */
export const finishDriveUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fileId: z.string().regex(/^[\w-]{10,}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertContentStaff(context as unknown as Ctx);
    const res = await fetch(`${GATEWAY}/drive/v3/files/${data.fileId}/permissions`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Drive permission failed [${res.status}]: ${body}`);
      throw new Error(`تم الرفع لكن تعذّر مشاركة الملف (${res.status})`);
    }
    return { url: `https://drive.google.com/file/d/${data.fileId}/view` };
  });
