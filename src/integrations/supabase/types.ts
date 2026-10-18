export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      announcement_reads: {
        Row: {
          announcement_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          read_at?: string
          user_id?: string
        }
        Update: {
          announcement_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          category: string
          created_by: string | null
          id: string
          pinned: boolean
          published_at: string
          target_department_ids: string[]
          target_levels: string[]
          title: string
        }
        Insert: {
          body: string
          category?: string
          created_by?: string | null
          id?: string
          pinned?: boolean
          published_at?: string
          target_department_ids?: string[]
          target_levels?: string[]
          title: string
        }
        Update: {
          body?: string
          category?: string
          created_by?: string | null
          id?: string
          pinned?: boolean
          published_at?: string
          target_department_ids?: string[]
          target_levels?: string[]
          title?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          kind: Database["public"]["Enums"]["event_kind"]
          location: string | null
          notes: string | null
          starts_at: string
          subject_id: string | null
          target_department_ids: string[]
          target_levels: string[]
          title: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          location?: string | null
          notes?: string | null
          starts_at: string
          subject_id?: string | null
          target_department_ids?: string[]
          target_levels?: string[]
          title: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          location?: string | null
          notes?: string | null
          starts_at?: string
          subject_id?: string | null
          target_department_ids?: string[]
          target_levels?: string[]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      lecture_resources: {
        Row: {
          created_at: string
          description: string | null
          drive_file_id: string | null
          id: string
          lecture_id: string
          name: string
          resource_type: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          drive_file_id?: string | null
          id?: string
          lecture_id: string
          name: string
          resource_type?: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          drive_file_id?: string | null
          id?: string
          lecture_id?: string
          name?: string
          resource_type?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecture_resources_lecture_id_fkey"
            columns: ["lecture_id"]
            isOneToOne: false
            referencedRelation: "lectures"
            referencedColumns: ["id"]
          },
        ]
      }
      lectures: {
        Row: {
          created_at: string
          description: string | null
          external_url: string | null
          file_path: string | null
          id: string
          subject_id: string
          title: string
          week: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          external_url?: string | null
          file_path?: string | null
          id?: string
          subject_id: string
          title: string
          week?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          external_url?: string | null
          file_path?: string | null
          id?: string
          subject_id?: string
          title?: string
          week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lectures_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id?: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          link: string | null
          target_department_ids: string[]
          target_levels: string[]
          title: string
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          link?: string | null
          target_department_ids?: string[]
          target_levels?: string[]
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          link?: string | null
          target_department_ids?: string[]
          target_levels?: string[]
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payment_requests: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          receipt_path: string | null
          reference: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["payment_request_status"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: string
          receipt_path?: string | null
          reference: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payment_request_status"]
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          receipt_path?: string | null
          reference?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payment_request_status"]
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          about_text: string
          currency: string
          designer_bio: string
          designer_contact: string
          designer_name: string
          id: number
          payment_instructions: string
          payment_methods: Json
          subscription_days: number
          subscription_price: number
          support_email: string
          support_phone: string
          support_telegram: string
          telegram_bot_username: string
          updated_at: string
        }
        Insert: {
          about_text?: string
          currency?: string
          designer_bio?: string
          designer_contact?: string
          designer_name?: string
          id?: number
          payment_instructions?: string
          payment_methods?: Json
          subscription_days?: number
          subscription_price?: number
          support_email?: string
          support_phone?: string
          support_telegram?: string
          telegram_bot_username?: string
          updated_at?: string
        }
        Update: {
          about_text?: string
          currency?: string
          designer_bio?: string
          designer_contact?: string
          designer_name?: string
          id?: number
          payment_instructions?: string
          payment_methods?: Json
          subscription_days?: number
          subscription_price?: number
          support_email?: string
          support_phone?: string
          support_telegram?: string
          telegram_bot_username?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          department_id: string | null
          full_name: string
          id: string
          level: string | null
          phone: string
          student_code: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          full_name?: string
          id: string
          level?: string | null
          phone?: string
          student_code?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          full_name?: string
          id?: string
          level?: string | null
          phone?: string
          student_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          code: string | null
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          level: string | null
          name: string
          sort_order: number
          term: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          level?: string | null
          name: string
          sort_order?: number
          term?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          level?: string | null
          name?: string
          sort_order?: number
          term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subjects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["subscription_status"] | null
          id: string
          note: string | null
          subscription_id: string
          to_status: Database["public"]["Enums"]["subscription_status"]
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          id?: string
          note?: string | null
          subscription_id: string
          to_status: Database["public"]["Enums"]["subscription_status"]
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          id?: string
          note?: string | null
          subscription_id?: string
          to_status?: Database["public"]["Enums"]["subscription_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          amount: number | null
          created_at: string
          end_at: string | null
          id: string
          payment_method: string | null
          payment_reference: string | null
          start_at: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          amount?: number | null
          created_at?: string
          end_at?: string | null
          id?: string
          payment_method?: string | null
          payment_reference?: string | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          amount?: number | null
          created_at?: string
          end_at?: string | null
          id?: string
          payment_method?: string | null
          payment_reference?: string | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_deliveries: {
        Row: {
          created_at: string
          error: string | null
          id: string
          notification_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          notification_id?: string | null
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          notification_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_link_tokens: {
        Row: {
          created_at: string
          expires_at: string
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_links: {
        Row: {
          blocked: boolean
          chat_id: number
          last_send_at: string | null
          last_send_status: string | null
          linked_at: string
          telegram_user_id: number
          telegram_username: string | null
          user_id: string
        }
        Insert: {
          blocked?: boolean
          chat_id: number
          last_send_at?: string | null
          last_send_status?: string | null
          linked_at?: string
          telegram_user_id: number
          telegram_username?: string | null
          user_id: string
        }
        Update: {
          blocked?: boolean
          chat_id?: number
          last_send_at?: string | null
          last_send_status?: string | null
          linked_at?: string
          telegram_user_id?: number
          telegram_username?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_subject: {
        Args: { _subject_id: string; _user_id: string }
        Returns: boolean
      }
      effective_status: {
        Args: { _s: Database["public"]["Tables"]["subscriptions"]["Row"] }
        Returns: Database["public"]["Enums"]["subscription_status"]
      }
      has_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      lecture_storage_subject: { Args: { _path: string }; Returns: string }
      matches_content_target: {
        Args: { _department_ids: string[]; _levels: string[]; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "staff" | "student"
      event_kind: "lecture" | "exam" | "assignment" | "other"
      payment_request_status: "pending" | "approved" | "rejected"
      subscription_status:
        | "pending"
        | "awaiting_payment"
        | "active"
        | "expired"
        | "suspended"
        | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "staff", "student"],
      event_kind: ["lecture", "exam", "assignment", "other"],
      payment_request_status: ["pending", "approved", "rejected"],
      subscription_status: [
        "pending",
        "awaiting_payment",
        "active",
        "expired",
        "suspended",
        "rejected",
      ],
    },
  },
} as const
