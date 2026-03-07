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
      activities: {
        Row: {
          created_at: string
          created_by: string | null
          event_source: string | null
          event_type: string
          id: string
          payload: Json | null
          related_entity_id: string
          related_entity_type: string
          summary: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_source?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          related_entity_id: string
          related_entity_type: string
          summary: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_source?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          related_entity_id?: string
          related_entity_type?: string
          summary?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          city: string | null
          company_size: string | null
          country: string | null
          created_at: string
          id: string
          industry: string | null
          name: string
          owner_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          city?: string | null
          company_size?: string | null
          country?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          name: string
          owner_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          city?: string | null
          company_size?: string | null
          country?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          name?: string
          owner_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          ad: string | null
          adset: string | null
          campaign: string | null
          city: string | null
          company_id: string | null
          country: string | null
          created_at: string
          full_name: string
          id: string
          landing_page: string | null
          language: string | null
          last_contact_at: string | null
          next_action_at: string | null
          notes: string | null
          owner_id: string | null
          preferred_channel: string | null
          primary_email: string | null
          primary_phone: string | null
          score: number | null
          source: string | null
          status: string
          tags: string[] | null
          timezone: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          ad?: string | null
          adset?: string | null
          campaign?: string | null
          city?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string
          full_name: string
          id?: string
          landing_page?: string | null
          language?: string | null
          last_contact_at?: string | null
          next_action_at?: string | null
          notes?: string | null
          owner_id?: string | null
          preferred_channel?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          score?: number | null
          source?: string | null
          status?: string
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          ad?: string | null
          adset?: string | null
          campaign?: string | null
          city?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string
          full_name?: string
          id?: string
          landing_page?: string | null
          language?: string | null
          last_contact_at?: string | null
          next_action_at?: string | null
          notes?: string | null
          owner_id?: string | null
          preferred_channel?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          score?: number | null
          source?: string | null
          status?: string
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          close_probability: number | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          currency: string
          expected_close_date: string | null
          id: string
          lost_reason: string | null
          owner_id: string | null
          pipeline_id: string | null
          product: string | null
          source: string | null
          stage_id: string | null
          status: string
          title: string
          updated_at: string
          value: number
          won_reason: string | null
        }
        Insert: {
          close_probability?: number | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          owner_id?: string | null
          pipeline_id?: string | null
          product?: string | null
          source?: string | null
          stage_id?: string | null
          status?: string
          title: string
          updated_at?: string
          value?: number
          won_reason?: string | null
        }
        Update: {
          close_probability?: number | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          owner_id?: string | null
          pipeline_id?: string | null
          product?: string | null
          source?: string | null
          stage_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          value?: number
          won_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          advisor_id: string | null
          attendance_status: string | null
          contact_id: string | null
          created_at: string
          deal_id: string | null
          end_at: string
          id: string
          location_or_link: string | null
          meeting_type: string | null
          notes: string | null
          start_at: string
          status: string
          timezone: string | null
          title: string
          updated_at: string
        }
        Insert: {
          advisor_id?: string | null
          attendance_status?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          end_at: string
          id?: string
          location_or_link?: string | null
          meeting_type?: string | null
          notes?: string | null
          start_at: string
          status?: string
          timezone?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          advisor_id?: string | null
          attendance_status?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          end_at?: string
          id?: string
          location_or_link?: string | null
          meeting_type?: string | null
          notes?: string | null
          start_at?: string
          status?: string
          timezone?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          order: number
          pipeline_id: string
          probability: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          order?: number
          pipeline_id: string
          probability?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          order?: number
          pipeline_id?: string
          probability?: number
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          deal_id: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          id: string
          owner_id: string | null
          priority: string
          status: string
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          owner_id?: string | null
          priority?: string
          status?: string
          task_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          owner_id?: string | null
          priority?: string
          status?: string
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
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
