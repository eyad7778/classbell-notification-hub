import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/daily-reminders")({
  server: { handlers: { GET: async ({ request }) => {
    const denied = await authenticateCronRequest(request);
    if (denied) return denied;
    try {
      const { sendDailyReminders } = await import("@/lib/daily-reminders.server");
      const result = await sendDailyReminders();
      return Response.json(result, { status: result.failed ? 502 : 200 });
    } catch (error) {
      console.error("Daily timetable reminders failed", error);
      return Response.json({ error: "تعذّر إكمال إرسال التذكير اليومي" }, { status: 500 });
    }
  } } },
});