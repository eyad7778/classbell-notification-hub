import { supabase } from "@/integrations/supabase/client";

// Drive is connected on the Lovable deployment; other hosts (Vercel) call it there.
const LOVABLE_HOST = "https://classbell-notification-hub.lovable.app";

function base() {
  const env = import.meta.env['VITE_DRIVE_PROXY_URL'] as string | undefined;
  if (env) return env.replace(/\/+$/, "");
  const h = window.location.hostname;
  return h.endsWith(".lovable.app") || h.endsWith(".lovableproject.com") || h === "localhost" ? "" : LOVABLE_HOST;
}

export async function driveCall<T>(action: "start" | "finish", data: unknown): Promise<T> {
  const { data: s } = await supabase.auth.getSession();
  const res = await fetch(`${base()}/api/public/drive/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `تعذّر الاتصال بخدمة Drive (${res.status})`);
  return json as T;
}
