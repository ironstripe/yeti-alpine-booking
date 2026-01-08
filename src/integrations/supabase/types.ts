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
      action_tasks: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string | null
          related_ticket_id: string | null
          related_ticket_item_id: string | null
          status: string
          task_type: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          related_ticket_id?: string | null
          related_ticket_item_id?: string | null
          status?: string
          task_type: string
          title: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          related_ticket_id?: string | null
          related_ticket_item_id?: string | null
          status?: string
          task_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_tasks_related_ticket_id_fkey"
            columns: ["related_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_tasks_related_ticket_item_id_fkey"
            columns: ["related_ticket_item_id"]
            isOneToOne: false
            referencedRelation: "ticket_items"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_requests: {
        Row: {
          converted_ticket_id: string | null
          created_at: string
          customer_data: Json
          duration_hours: number | null
          estimated_price: number | null
          expires_at: string
          id: string
          magic_token: string
          notes: string | null
          participant_count: number
          participants_data: Json
          processed_at: string | null
          processed_by: string | null
          product_id: string | null
          request_number: string
          requested_date: string
          requested_time_slot: string | null
          source: string
          sport_type: string
          status: string
          type: string
          voucher_code: string | null
          voucher_discount: number | null
        }
        Insert: {
          converted_ticket_id?: string | null
          created_at?: string
          customer_data?: Json
          duration_hours?: number | null
          estimated_price?: number | null
          expires_at?: string
          id?: string
          magic_token?: string
          notes?: string | null
          participant_count?: number
          participants_data?: Json
          processed_at?: string | null
          processed_by?: string | null
          product_id?: string | null
          request_number: string
          requested_date: string
          requested_time_slot?: string | null
          source?: string
          sport_type: string
          status?: string
          type: string
          voucher_code?: string | null
          voucher_discount?: number | null
        }
        Update: {
          converted_ticket_id?: string | null
          created_at?: string
          customer_data?: Json
          duration_hours?: number | null
          estimated_price?: number | null
          expires_at?: string
          id?: string
          magic_token?: string
          notes?: string | null
          participant_count?: number
          participants_data?: Json
          processed_at?: string | null
          processed_by?: string | null
          product_id?: string | null
          request_number?: string
          requested_date?: string
          requested_time_slot?: string | null
          source?: string
          sport_type?: string
          status?: string
          type?: string
          voucher_code?: string | null
          voucher_discount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_converted_ticket_id_fkey"
            columns: ["converted_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_policy: {
        Row: {
          free_cancellation_hours: number | null
          id: string
          late_cancellation_percent: number | null
          no_show_percent: number | null
          updated_at: string | null
        }
        Insert: {
          free_cancellation_hours?: number | null
          id?: string
          late_cancellation_percent?: number | null
          no_show_percent?: number | null
          updated_at?: string | null
        }
        Update: {
          free_cancellation_hours?: number | null
          id?: string
          late_cancellation_percent?: number | null
          no_show_percent?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      closure_dates: {
        Row: {
          created_at: string | null
          date: string
          id: string
          reason: string | null
          season_id: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          reason?: string | null
          season_id?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          reason?: string | null
          season_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "closure_dates_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
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
      daily_reconciliations: {
        Row: {
          card_actual: number | null
          card_expected: number
          cash_actual: number | null
          cash_expected: number
          closed_at: string | null
          closed_by: string | null
          closed_by_name: string | null
          created_at: string
          date: string
          difference: number
          difference_acknowledged: boolean
          difference_reason: string | null
          id: string
          notes: string | null
          status: string
          total_bookings: number
          total_hours: number
          total_instructors: number
          total_revenue: number
          twint_actual: number | null
          twint_expected: number
          updated_at: string
        }
        Insert: {
          card_actual?: number | null
          card_expected?: number
          cash_actual?: number | null
          cash_expected?: number
          closed_at?: string | null
          closed_by?: string | null
          closed_by_name?: string | null
          created_at?: string
          date: string
          difference?: number
          difference_acknowledged?: boolean
          difference_reason?: string | null
          id?: string
          notes?: string | null
          status?: string
          total_bookings?: number
          total_hours?: number
          total_instructors?: number
          total_revenue?: number
          twint_actual?: number | null
          twint_expected?: number
          updated_at?: string
        }
        Update: {
          card_actual?: number | null
          card_expected?: number
          cash_actual?: number | null
          cash_expected?: number
          closed_at?: string | null
          closed_by?: string | null
          closed_by_name?: string | null
          created_at?: string
          date?: string
          difference?: number
          difference_acknowledged?: boolean
          difference_reason?: string | null
          id?: string
          notes?: string | null
          status?: string
          total_bookings?: number
          total_hours?: number
          total_instructors?: number
          total_revenue?: number
          twint_actual?: number | null
          twint_expected?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          click_count: number | null
          clicked_at: string | null
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          open_count: number | null
          opened_at: string | null
          provider_message_id: string | null
          recipient_email: string
          recipient_name: string | null
          sent_at: string | null
          status: string
          subject: string
          template_id: string | null
        }
        Insert: {
          click_count?: number | null
          clicked_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          open_count?: number | null
          opened_at?: string | null
          provider_message_id?: string | null
          recipient_email: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          template_id?: string | null
        }
        Update: {
          click_count?: number | null
          clicked_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          open_count?: number | null
          opened_at?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          attachments: Json | null
          body_html: string
          body_text: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          subject: string
          trigger: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          attachments?: Json | null
          body_html: string
          body_text?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          subject: string
          trigger: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          attachments?: Json | null
          body_html?: string
          body_text?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          subject?: string
          trigger?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      group_course_enrollments: {
        Row: {
          attendance_status: string | null
          checked_in_at: string | null
          created_at: string | null
          id: string
          instance_id: string
          notes: string | null
          participant_id: string | null
          ticket_item_id: string | null
        }
        Insert: {
          attendance_status?: string | null
          checked_in_at?: string | null
          created_at?: string | null
          id?: string
          instance_id: string
          notes?: string | null
          participant_id?: string | null
          ticket_item_id?: string | null
        }
        Update: {
          attendance_status?: string | null
          checked_in_at?: string | null
          created_at?: string | null
          id?: string
          instance_id?: string
          notes?: string | null
          participant_id?: string | null
          ticket_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_course_enrollments_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "group_course_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_course_enrollments_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "customer_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_course_enrollments_ticket_item_id_fkey"
            columns: ["ticket_item_id"]
            isOneToOne: false
            referencedRelation: "ticket_items"
            referencedColumns: ["id"]
          },
        ]
      }
      group_course_instances: {
        Row: {
          assistant_instructor_id: string | null
          course_id: string
          created_at: string | null
          current_participants: number | null
          date: string
          end_time: string
          id: string
          instructor_id: string | null
          notes: string | null
          schedule_id: string | null
          start_time: string
          status: string | null
        }
        Insert: {
          assistant_instructor_id?: string | null
          course_id: string
          created_at?: string | null
          current_participants?: number | null
          date: string
          end_time: string
          id?: string
          instructor_id?: string | null
          notes?: string | null
          schedule_id?: string | null
          start_time: string
          status?: string | null
        }
        Update: {
          assistant_instructor_id?: string | null
          course_id?: string
          created_at?: string | null
          current_participants?: number | null
          date?: string
          end_time?: string
          id?: string
          instructor_id?: string | null
          notes?: string | null
          schedule_id?: string | null
          start_time?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_course_instances_assistant_instructor_id_fkey"
            columns: ["assistant_instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_course_instances_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "group_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_course_instances_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_course_instances_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "group_course_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      group_course_schedules: {
        Row: {
          course_id: string
          created_at: string | null
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean | null
          start_time: string
        }
        Insert: {
          course_id: string
          created_at?: string | null
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean | null
          start_time: string
        }
        Update: {
          course_id?: string
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_course_schedules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "group_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      group_courses: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          discipline: string
          id: string
          is_active: boolean | null
          max_age: number | null
          max_participants: number
          meeting_point: string | null
          min_age: number | null
          name: string
          price_full_week: number | null
          price_per_day: number
          skill_level: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          discipline?: string
          id?: string
          is_active?: boolean | null
          max_age?: number | null
          max_participants?: number
          meeting_point?: string | null
          min_age?: number | null
          name: string
          price_full_week?: number | null
          price_per_day: number
          skill_level?: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          discipline?: string
          id?: string
          is_active?: boolean | null
          max_age?: number | null
          max_participants?: number
          meeting_point?: string | null
          min_age?: number | null
          name?: string
          price_full_week?: number | null
          price_per_day?: number
          skill_level?: string
          updated_at?: string | null
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
      high_season_periods: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          name: string
          season_id: string | null
          start_date: string
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          name: string
          season_id?: string | null
          start_date: string
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          name?: string
          season_id?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "high_season_periods_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      instructor_absences: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          instructor_id: string
          is_full_day: boolean | null
          reason: string | null
          rejection_reason: string | null
          requested_by: string | null
          start_date: string
          status: string
          time_end: string | null
          time_start: string | null
          type: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          instructor_id: string
          is_full_day?: boolean | null
          reason?: string | null
          rejection_reason?: string | null
          requested_by?: string | null
          start_date: string
          status?: string
          time_end?: string | null
          time_start?: string | null
          type: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          instructor_id?: string
          is_full_day?: boolean | null
          reason?: string | null
          rejection_reason?: string | null
          requested_by?: string | null
          start_date?: string
          status?: string
          time_end?: string | null
          time_start?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructor_absences_instructor_id_fkey"
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
      notification_preferences: {
        Row: {
          created_at: string | null
          email_frequency: string | null
          id: string
          preferences: Json | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email_frequency?: string | null
          id?: string
          preferences?: Json | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email_frequency?: string | null
          id?: string
          preferences?: Json | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          notification_type: string
          payload: Json
          recipient_email: string | null
          recipient_id: string | null
          recipient_phone: string | null
          recipient_type: string
          sent_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          notification_type: string
          payload: Json
          recipient_email?: string | null
          recipient_id?: string | null
          recipient_phone?: string | null
          recipient_type: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          notification_type?: string
          payload?: Json
          recipient_email?: string | null
          recipient_id?: string | null
          recipient_phone?: string | null
          recipient_type?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string | null
          read_at: string | null
          reference_id: string | null
          reference_type: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          ticket_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method: string
          ticket_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          applies_to_products: string[] | null
          created_at: string | null
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          min_days: number | null
          min_quantity: number | null
          name: string
          partner_name: string | null
          promo_code: string | null
          sort_order: number | null
          type: string
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applies_to_products?: string[] | null
          created_at?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean | null
          min_days?: number | null
          min_quantity?: number | null
          name: string
          partner_name?: string | null
          promo_code?: string | null
          sort_order?: number | null
          type: string
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applies_to_products?: string[] | null
          created_at?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          min_days?: number | null
          min_quantity?: number | null
          name?: string
          partner_name?: string | null
          promo_code?: string | null
          sort_order?: number | null
          type?: string
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
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
      school_settings: {
        Row: {
          account_holder: string | null
          bank_name: string | null
          bic: string | null
          city: string | null
          country: string | null
          created_at: string | null
          email: string | null
          iban: string | null
          id: string
          lesson_times: Json | null
          logo_url: string | null
          name: string
          office_hours: Json | null
          phone: string | null
          slogan: string | null
          street: string | null
          updated_at: string | null
          vat_number: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          account_holder?: string | null
          bank_name?: string | null
          bic?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          lesson_times?: Json | null
          logo_url?: string | null
          name?: string
          office_hours?: Json | null
          phone?: string | null
          slogan?: string | null
          street?: string | null
          updated_at?: string | null
          vat_number?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          account_holder?: string | null
          bank_name?: string | null
          bic?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          lesson_times?: Json | null
          logo_url?: string | null
          name?: string
          office_hours?: Json | null
          phone?: string | null
          slogan?: string | null
          street?: string | null
          updated_at?: string | null
          vat_number?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      seasons: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          is_current: boolean | null
          name: string
          start_date: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          is_current?: boolean | null
          name: string
          start_date: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          is_current?: boolean | null
          name?: string
          start_date?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      shop_article_variants: {
        Row: {
          article_id: string
          created_at: string
          id: string
          name: string
          price: number | null
          sku: string
          stock_quantity: number
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          name: string
          price?: number | null
          sku: string
          stock_quantity?: number
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          name?: string
          price?: number | null
          sku?: string
          stock_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "shop_article_variants_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "shop_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_articles: {
        Row: {
          category: string
          cost_price: number | null
          created_at: string
          description: string | null
          has_variants: boolean
          id: string
          image_url: string | null
          is_popular: boolean
          min_stock: number
          name: string
          price: number
          sku: string
          status: string
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          category?: string
          cost_price?: number | null
          created_at?: string
          description?: string | null
          has_variants?: boolean
          id?: string
          image_url?: string | null
          is_popular?: boolean
          min_stock?: number
          name: string
          price: number
          sku: string
          status?: string
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          category?: string
          cost_price?: number | null
          created_at?: string
          description?: string | null
          has_variants?: boolean
          id?: string
          image_url?: string | null
          is_popular?: boolean
          min_stock?: number
          name?: string
          price?: number
          sku?: string
          status?: string
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: []
      }
      shop_stock_movements: {
        Row: {
          article_id: string
          created_at: string
          created_by: string | null
          id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          type: string
          variant_id: string | null
        }
        Insert: {
          article_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          type: string
          variant_id?: string | null
        }
        Update: {
          article_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          type?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_stock_movements_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "shop_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "shop_article_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_transaction_items: {
        Row: {
          article_id: string
          created_at: string
          id: string
          quantity: number
          total_price: number
          transaction_id: string
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          quantity?: number
          total_price: number
          transaction_id: string
          unit_price: number
          variant_id?: string | null
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          quantity?: number
          total_price?: number
          transaction_id?: string
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_transaction_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "shop_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "shop_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_transaction_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "shop_article_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          discount_amount: number
          discount_percent: number | null
          discount_reason: string | null
          id: string
          linked_ticket_id: string | null
          payment_method: string
          subtotal: number
          total: number
          transaction_number: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date?: string
          discount_amount?: number
          discount_percent?: number | null
          discount_reason?: string | null
          id?: string
          linked_ticket_id?: string | null
          payment_method: string
          subtotal?: number
          total?: number
          transaction_number: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          discount_amount?: number
          discount_percent?: number | null
          discount_reason?: string | null
          id?: string
          linked_ticket_id?: string | null
          payment_method?: string
          subtotal?: number
          total?: number
          transaction_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_transactions_linked_ticket_id_fkey"
            columns: ["linked_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          comment_type: string
          content: string
          created_at: string
          created_by_name: string
          created_by_user_id: string
          id: string
          ticket_id: string
          ticket_item_id: string | null
        }
        Insert: {
          comment_type: string
          content: string
          created_at?: string
          created_by_name: string
          created_by_user_id: string
          id?: string
          ticket_id: string
          ticket_item_id?: string | null
        }
        Update: {
          comment_type?: string
          content?: string
          created_at?: string
          created_by_name?: string
          created_by_user_id?: string
          id?: string
          ticket_id?: string
          ticket_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_ticket_item_id_fkey"
            columns: ["ticket_item_id"]
            isOneToOne: false
            referencedRelation: "ticket_items"
            referencedColumns: ["id"]
          },
        ]
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
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      voucher_redemptions: {
        Row: {
          amount: number
          balance_after: number
          id: string
          reason: string | null
          redeemed_at: string
          redeemed_by: string | null
          ticket_id: string | null
          voucher_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          id?: string
          reason?: string | null
          redeemed_at?: string
          redeemed_by?: string | null
          ticket_id?: string | null
          voucher_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          id?: string
          reason?: string | null
          redeemed_at?: string
          redeemed_by?: string | null
          ticket_id?: string | null
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_redemptions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          buyer_customer_id: string | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_phone: string | null
          code: string
          created_at: string
          created_by: string | null
          expiry_date: string
          id: string
          internal_note: string | null
          is_paid: boolean | null
          original_value: number
          payment_method: string | null
          recipient_message: string | null
          recipient_name: string | null
          remaining_balance: number
          status: string
          updated_at: string
        }
        Insert: {
          buyer_customer_id?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          expiry_date: string
          id?: string
          internal_note?: string | null
          is_paid?: boolean | null
          original_value: number
          payment_method?: string | null
          recipient_message?: string | null
          recipient_name?: string | null
          remaining_balance: number
          status?: string
          updated_at?: string
        }
        Update: {
          buyer_customer_id?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_phone?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          expiry_date?: string
          id?: string
          internal_note?: string | null
          is_paid?: boolean | null
          original_value?: number
          payment_method?: string | null
          recipient_message?: string | null
          recipient_name?: string | null
          remaining_balance?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_buyer_customer_id_fkey"
            columns: ["buyer_customer_id"]
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
      get_instructor_for_user: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_office: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "office" | "teacher"
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
    Enums: {
      app_role: ["admin", "office", "teacher"],
    },
  },
} as const
