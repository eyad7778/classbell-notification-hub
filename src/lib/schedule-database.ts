import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ReminderRecipient } from "@/lib/daily-reminders";

// External schema additions stay separate until managed types can be regenerated.
type ScheduleDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      class_reminder_deliveries: {
        Row: { user_id: string; run_date: string; status: string; created_at: string };
        Insert: { user_id: string; run_date: string; status?: string; created_at?: string };
        Update: { status?: string };
        Relationships: [];
      };
    };
    Functions: Database["public"]["Functions"] & {
      schedule_reminder_recipients: { Args: { _offset: number; _limit: number }; Returns: ReminderRecipient[] };
    };
  };
};
export function scheduleDatabase(client: SupabaseClient<Database>) {
  return client as unknown as SupabaseClient<ScheduleDatabase>;
}