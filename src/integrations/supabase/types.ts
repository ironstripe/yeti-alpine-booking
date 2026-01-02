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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      conversations: {
        Row: {
          ai_confidence_score: number | null
          ai_extracted_data: Json | null
          assigned_to: string | null
          channel: string
          contact_identifier: string
          contact_name: string | null
          content: string
          created_at: string
          customer_id: string | null
          direction: string
          id: string
          notes: string | null
          processed_at: string | null
          related_ticket_id: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          ai_confidence_score?: number | null
          ai_extracted_data?: Json | null
          assigned_to?: string | null
          channel: string
          contact_identifier: string
          contact_name?: string | null
          content: string
          created_at?: string
          customer_id?: string | null
          direction?: string
          id?: string
          notes?: string | null
          processed_at?: string | null
          related_ticket_id?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          ai_confidence_score?: number | null
          ai_extracted_data?: Json | null
          assigned_to?: string | null
          channel?: string
          contact_identifier?: string
          contact_name?: string | null
          content?: string
          created_at?: string
          customer_id?: string | null
          direction?: string
          id?: string
          notes?: string | null
          processed_at?: string | null
          related_ticket_id?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_related_ticket_id_fkey"
            columns: ["related_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_participants: {
        Row: {
          birth_date: string
          created_at: string
          customer_id: string
          first_name: string
          id: string
          last_name: string | null
          level_current_season: string | null
          level_last_season: string | null
          notes: string | null
          sport: string | null
        }
        Insert: {
          birth_date: string
          created_at?: string
          customer_id: string
          first_name: string
          id?: string
          last_name?: string | null
          level_current_season?: string | null
          level_last_season?: string | null
          notes?: string | null
          sport?: string | null
        }
        Update: {
          birth_date?: string
          created_at?: string
          customer_id?: string
          first_name?: string
          id?: string
          last_name?: string | null
          level_current_season?: string | null
          level_last_season?: string | null
          notes?: string | null
          sport?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_participants_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          additional_emails: Json | null
          additional_phones: Json | null
          city: string | null
          country: string | null
          created_at: string
          email: string
          first_name: string | null
          holiday_address: string
          id: string
          kulanz_score: number | null
          language: string | null
          last_name: string
          marketing_consent: boolean | null
          notes: string | null
          phone: string | null
          preferred_channel: string | null
          street: string | null
          zip: string | null
        }
        Insert: {
          additional_emails?: Json | null
          additional_phones?: Json | null
          city?: string | null
          country?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          holiday_address?: string
          id?: string
          kulanz_score?: number | null
          language?: string | null
          last_name: string
          marketing_consent?: boolean | null
          notes?: string | null
          phone?: string | null
          preferred_channel?: string | null
          street?: string | null
          zip?: string | null
        }
        Update: {
          additional_emails?: Json | null
          additional_phones?: Json | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          holiday_address?: string
          id?: string
          kulanz_score?: number | null
          language?: string | null
          last_name?: string
          marketing_consent?: boolean | null
          notes?: string | null
          phone?: string | null
          preferred_channel?: string | null
          street?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      groups: {
        Row: {
          created_at: string
          end_date: string
          id: string
          instructor_id: string | null
          level: string
          max_participants: number | null
          meeting_point: string | null
          min_participants: number | null
          name: string
          notes: string | null
          sport: string | null
          start_date: string
          status: string | null
          time_afternoon_end: string | null
          time_afternoon_start: string | null
          time_morning_end: string | null
          time_morning_start: string | null
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          instructor_id?: string | null
          level: string
          max_participants?: number | null
          meeting_point?: string | null
          min_participants?: number | null
          name: string
          notes?: string | null
          sport?: string | null
          start_date: string
          status?: string | null
          time_afternoon_end?: string | null
          time_afternoon_start?: string | null
          time_morning_end?: string | null
          time_morning_start?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          instructor_id?: string | null
          level?: string
          max_participants?: number | null
          meeting_point?: string | null
          min_participants?: number | null
          name?: string
          notes?: string | null
          sport?: string | null
          start_date?: string
          status?: string | null
          time_afternoon_end?: string | null
          time_afternoon_start?: string | null
          time_morning_end?: string | null
          time_morning_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
        ]
      }
      instructors: {
        Row: {
          ahv_number: string | null
          bank_name: string | null
          birth_date: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string
          entry_date: string | null
          first_name: string
          gender: string | null
          hourly_rate: number
          iban: string | null
          id: string
          languages: string[] | null
          last_name: string
          level: string | null
          notes: string | null
          phone: string
          real_time_status: string | null
          role: string | null
          specialization: string | null
          status: string | null
          street: string | null
          zip: string | null
        }
        Insert: {
          ahv_number?: string | null
          bank_name?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email: string
          entry_date?: string | null
          first_name: string
          gender?: string | null
          hourly_rate: number
          iban?: string | null
          id?: string
          languages?: string[] | null
          last_name: string
          level?: string | null
          notes?: string | null
          phone: string
          real_time_status?: string | null
          role?: string | null
          specialization?: string | null
          status?: string | null
          street?: string | null
          zip?: string | null
        }
        Update: {
          ahv_number?: string | null
          bank_name?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string
          entry_date?: string | null
          first_name?: string
          gender?: string | null
          hourly_rate?: number
          iban?: string | null
          id?: string
          languages?: string[] | null
          last_name?: string
          level?: string | null
          notes?: string | null
          phone?: string
          real_time_status?: string | null
          role?: string | null
          specialization?: string | null
          status?: string | null
          street?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string
          currency: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean | null
          name: string
          price: number
          sort_order: number | null
          type: string
          vat_rate: number | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          price: number
          sort_order?: number | null
          type: string
          vat_rate?: number | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number
          sort_order?: number | null
          type?: string
          vat_rate?: number | null
        }
        Relationships: []
      }
      ticket_items: {
        Row: {
          actual_duration_minutes: number | null
          created_at: string
          date: string
          discount_percent: number | null
          discount_reason: string | null
          id: string
          instructor_confirmation: string | null
          instructor_confirmed_at: string | null
          instructor_id: string | null
          instructor_notes: string | null
          internal_notes: string | null
          line_total: number | null
          meeting_point: string | null
          participant_id: string | null
          product_id: string
          quantity: number | null
          status: string | null
          ticket_id: string
          time_end: string | null
          time_start: string | null
          unit_price: number
        }
        Insert: {
          actual_duration_minutes?: number | null
          created_at?: string
          date: string
          discount_percent?: number | null
          discount_reason?: string | null
          id?: string
          instructor_confirmation?: string | null
          instructor_confirmed_at?: string | null
          instructor_id?: string | null
          instructor_notes?: string | null
          internal_notes?: string | null
          line_total?: number | null
          meeting_point?: string | null
          participant_id?: string | null
          product_id: string
          quantity?: number | null
          status?: string | null
          ticket_id: string
          time_end?: string | null
          time_start?: string | null
          unit_price: number
        }
        Update: {
          actual_duration_minutes?: number | null
          created_at?: string
          date?: string
          discount_percent?: number | null
          discount_reason?: string | null
          id?: string
          instructor_confirmation?: string | null
          instructor_confirmed_at?: string | null
          instructor_id?: string | null
          instructor_notes?: string | null
          internal_notes?: string | null
          line_total?: number | null
          meeting_point?: string | null
          participant_id?: string | null
          product_id?: string
          quantity?: number | null
          status?: string | null
          ticket_id?: string
          time_end?: string | null
          time_start?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_items_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_items_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "customer_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_items_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          internal_notes: string | null
          notes: string | null
          paid_amount: number | null
          payment_due_date: string | null
          payment_method: string | null
          status: string | null
          ticket_number: string
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          internal_notes?: string | null
          notes?: string | null
          paid_amount?: number | null
          payment_due_date?: string | null
          payment_method?: string | null
          status?: string | null
          ticket_number: string
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          internal_notes?: string | null
          notes?: string | null
          paid_amount?: number | null
          payment_due_date?: string | null
          payment_method?: string | null
          status?: string | null
          ticket_number?: string
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      training_participants: {
        Row: {
          attended_at: string | null
          confirmed_at: string | null
          created_at: string
          id: string
          instructor_id: string
          notes: string | null
          status: string | null
          training_id: string
        }
        Insert: {
          attended_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          instructor_id: string
          notes?: string | null
          status?: string | null
          training_id: string
        }
        Update: {
          attended_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          instructor_id?: string
          notes?: string | null
          status?: string | null
          training_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_participants_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_participants_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      trainings: {
        Row: {
          created_at: string
          date: string
          description: string | null
          id: string
          is_mandatory: boolean | null
          lead_instructor_id: string | null
          location: string | null
          max_participants: number | null
          name: string
          notes: string | null
          status: string | null
          time_end: string
          time_start: string
        }
        Insert: {
          created_at?: string
          date: string
          description?: string | null
          id?: string
          is_mandatory?: boolean | null
          lead_instructor_id?: string | null
          location?: string | null
          max_participants?: number | null
          name: string
          notes?: string | null
          status?: string | null
          time_end: string
          time_start: string
        }
        Update: {
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          is_mandatory?: boolean | null
          lead_instructor_id?: string | null
          location?: string | null
          max_participants?: number | null
          name?: string
          notes?: string | null
          status?: string | null
          time_end?: string
          time_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainings_lead_instructor_id_fkey"
            columns: ["lead_instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
