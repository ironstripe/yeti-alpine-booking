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
      customer_participants: {
        Row: {
          birth_date: string
          created_at: string
          customer_id: string
          first_name: string
          id: string
          last_name: string | null
          level: string | null
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
          level?: string | null
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
          level?: string | null
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
          city: string | null
          country: string | null
          created_at: string
          email: string
          first_name: string | null
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
          city?: string | null
          country?: string | null
          created_at?: string
          email: string
          first_name?: string | null
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
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
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
      instructors: {
        Row: {
          ahv_number: string | null
          bank_name: string | null
          birth_date: string | null
          created_at: string
          email: string
          first_name: string
          hourly_rate: number
          iban: string | null
          id: string
          last_name: string
          level: string | null
          notes: string | null
          phone: string
          real_time_status: string | null
          specialization: string | null
          status: string | null
        }
        Insert: {
          ahv_number?: string | null
          bank_name?: string | null
          birth_date?: string | null
          created_at?: string
          email: string
          first_name: string
          hourly_rate: number
          iban?: string | null
          id?: string
          last_name: string
          level?: string | null
          notes?: string | null
          phone: string
          real_time_status?: string | null
          specialization?: string | null
          status?: string | null
        }
        Update: {
          ahv_number?: string | null
          bank_name?: string | null
          birth_date?: string | null
          created_at?: string
          email?: string
          first_name?: string
          hourly_rate?: number
          iban?: string | null
          id?: string
          last_name?: string
          level?: string | null
          notes?: string | null
          phone?: string
          real_time_status?: string | null
          specialization?: string | null
          status?: string | null
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
