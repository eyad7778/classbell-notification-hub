import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Lets the Vercel copy of the site use the Drive connection that lives on Lovable.
const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const ALLOWED = [/^https:\/\/smartstudent-gilt\.vercel\.app$/, /^https:\/\/[\w-]+\.vercel\.app$/, /^https:\/\/[\w.-]+\.lovable\.app$/, /^http:\/\/localhost(:\d+)?$/];

function cors(origin: string | null) {
  const ok = origin && ALLOWED.some((r) => r.test(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Expose-Headers": "content-type",
    Vary: "Origin",
  };
}

function gw(extra: Record<string, string> = {}) {
  const lovable = process.env["LOVABLE_API_KEY"];
  const drive = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovable || !drive) throw new Error("ربط Google Drive غير مضبوط على الخادم");
  return { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": drive, ...extra };
}

async function authorize(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (token.split(".").length !== 3) throw new Error("سجّل الدخول أولًا");
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const sb = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getClaims(token);
  const uid = data?.claims?.sub;
  if (error || !uid) throw new Error("سجّل الدخول أولًا");
  const { data: owner } = await sb.rpc("has_role", { _user_id: uid, _role: "owner" });
  if (owner) return;
  const { data: perm } = await sb.rpc("has_staff_permission", { _user_id: uid, _permission: "content" });
  if (!perm) throw new Error("غير مصرح لك برفع المحاضرات");
}

const startSchema = z.object({
  name: z.string().min(1).max(200),
  mimeType: z.string().max(120),
  size: z.number().int().positive().max(5 * 1024 ** 3),
  origin: z.string().url(),
});
const finishSchema = z.object({ fileId: z.string().regex(/^[\w-]{10,}$/) });

export const Route = createFileRoute("/api/public/drive/$action")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => new Response(null, { status: 204, headers: cors(request.headers.get("origin")) }),
      POST: async ({ request, params }) => {
        const h = cors(request.headers.get("origin"));
        try {
          await authorize(request);
          const body = await request.json();
          if (params.action === "start") {
            const d = startSchema.parse(body);
            const res = await fetch(`${GATEWAY}/upload/drive/v3/files?uploadType=resumable&fields=id`, {
              method: "POST",
              headers: gw({
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": d.mimeType || "application/octet-stream",
                "X-Upload-Content-Length": String(d.size),
                Origin: d.origin,
              }),
              body: JSON.stringify({ name: d.name }),
            });
            if (!res.ok) {
              console.error(`Drive start failed [${res.status}]: ${await res.text()}`);
              throw new Error(`تعذّر بدء الرفع على Drive (${res.status})`);
            }
            const uploadUrl = res.headers.get("location");
            if (!uploadUrl) throw new Error("لم يرجع Drive رابط الرفع");
            return Response.json({ uploadUrl }, { headers: h });
          }
          if (params.action === "finish") {
            const d = finishSchema.parse(body);
            const res = await fetch(`${GATEWAY}/drive/v3/files/${d.fileId}/permissions`, {
              method: "POST",
              headers: gw({ "Content-Type": "application/json" }),
              body: JSON.stringify({ role: "reader", type: "anyone" }),
            });
            if (!res.ok) {
              console.error(`Drive permission failed [${res.status}]: ${await res.text()}`);
              throw new Error(`تم الرفع لكن تعذّر مشاركة الملف (${res.status})`);
            }
            return Response.json({ url: `https://drive.google.com/file/d/${d.fileId}/view` }, { headers: h });
          }
          return Response.json({ error: "Not found" }, { status: 404, headers: h });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "خطأ";
          return Response.json({ error: msg }, { status: 400, headers: h });
        }
      },
    },
  },
});
