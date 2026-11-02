import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./types";

type TableShape<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  description: string;
  price: number;
  duration_days: number;
  features: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type SubscriptionPlanTable = TableShape<
  SubscriptionPlan,
  Omit<SubscriptionPlan, "id" | "created_at" | "updated_at"> & {
    id?: string;
    created_at?: string;
    updated_at?: string;
  }
>;

type SubscriptionPeriod = {
  id: string;
  user_id: string;
  plan_id: string | null;
  payment_request_id: string | null;
  plan_name: string;
  duration_days: number;
  amount: number;
  status: Database["public"]["Enums"]["subscription_status"];
  start_at: string;
  end_at: string;
  created_at: string;
};

type SubscriptionPeriodTable = TableShape<
  SubscriptionPeriod,
  Omit<SubscriptionPeriod, "id" | "created_at"> & {
    id?: string;
    created_at?: string;
  }
>;

type ExistingTables = Database["public"]["Tables"];
type ExtendedTables = Omit<ExistingTables, "subscriptions" | "payment_requests" | "notifications"> & {
  subscription_plans: SubscriptionPlanTable;
  subscription_periods: SubscriptionPeriodTable;
  subscriptions: Omit<ExistingTables["subscriptions"], "Row" | "Insert" | "Update"> & {
    Row: ExistingTables["subscriptions"]["Row"] & { plan_id: string | null };
    Insert: ExistingTables["subscriptions"]["Insert"] & { plan_id?: string | null };
    Update: ExistingTables["subscriptions"]["Update"] & { plan_id?: string | null };
  };
  payment_requests: Omit<ExistingTables["payment_requests"], "Row" | "Insert" | "Update"> & {
    Row: ExistingTables["payment_requests"]["Row"] & {
      plan_id: string | null;
      plan_name_snapshot: string | null;
      plan_duration_days_snapshot: number | null;
    };
    Insert: ExistingTables["payment_requests"]["Insert"] & {
      plan_id?: string | null;
      plan_name_snapshot?: string | null;
      plan_duration_days_snapshot?: number | null;
    };
    Update: ExistingTables["payment_requests"]["Update"] & {
      plan_id?: string | null;
      plan_name_snapshot?: string | null;
      plan_duration_days_snapshot?: number | null;
    };
  };
  notifications: Omit<ExistingTables["notifications"], "Row" | "Insert" | "Update"> & {
    Row: ExistingTables["notifications"]["Row"] & { dedupe_key: string | null };
    Insert: ExistingTables["notifications"]["Insert"] & { dedupe_key?: string | null };
    Update: ExistingTables["notifications"]["Update"] & { dedupe_key?: string | null };
  };
};

type ExtendedFunctions = Database["public"]["Functions"] & {
  create_plan_payment_request: {
    Args: {
      _user_id: string;
      _plan_id: string;
      _method: string;
      _reference: string;
      _receipt_path: string;
    };
    Returns: string;
  };
  review_subscription_payment: {
    Args: {
      _payment_request_id: string;
      _approve: boolean;
      _reviewed_by: string;
      _note: string | null;
    };
    Returns: Json;
  };
};

export type ExtendedDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: ExtendedTables;
    Functions: ExtendedFunctions;
  };
};

export function withSchemaExtensions(
  client: SupabaseClient<Database>,
): SupabaseClient<ExtendedDatabase> {
  return client as SupabaseClient<ExtendedDatabase>;
}
