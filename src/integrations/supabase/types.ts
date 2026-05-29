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
      channels: {
        Row: {
          access_token: string | null
          business_account_id: string | null
          business_name: string | null
          connected_at: string | null
          created_at: string
          display_phone: string | null
          id: string
          is_active: boolean
          phone_number_id: string | null
          provider: string
          status: string
          type: string
          updated_at: string
          user_id: string
          waba_id: string | null
          webhook_verify_token: string | null
        }
        Insert: {
          access_token?: string | null
          business_account_id?: string | null
          business_name?: string | null
          connected_at?: string | null
          created_at?: string
          display_phone?: string | null
          id?: string
          is_active?: boolean
          phone_number_id?: string | null
          provider?: string
          status?: string
          type?: string
          updated_at?: string
          user_id: string
          waba_id?: string | null
          webhook_verify_token?: string | null
        }
        Update: {
          access_token?: string | null
          business_account_id?: string | null
          business_name?: string | null
          connected_at?: string | null
          created_at?: string
          display_phone?: string | null
          id?: string
          is_active?: boolean
          phone_number_id?: string | null
          provider?: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
          waba_id?: string | null
          webhook_verify_token?: string | null
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
          birthday: string | null
          budget: number | null
          budget_currency: string
          campaign: string | null
          city: string | null
          company_id: string | null
          company_name: string | null
          country: string | null
          created_at: string
          custom_fields: Json | null
          expected_close_date: string | null
          first_name: string | null
          full_name: string
          id: string
          landing_page: string | null
          language: string | null
          last_contact_at: string | null
          last_name: string | null
          lead_status: string | null
          lost_reason: string | null
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          next_action_at: string | null
          notes: string | null
          organization_id: string | null
          owner_id: string | null
          pipeline_id: string | null
          preferred_channel: string | null
          primary_email: string | null
          primary_phone: string | null
          score: number | null
          score_calculated_at: string | null
          score_tier: string | null
          source: string | null
          stage_id: string | null
          status: string
          tags: string[] | null
          timezone: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          ad?: string | null
          adset?: string | null
          birthday?: string | null
          budget?: number | null
          budget_currency?: string
          campaign?: string | null
          city?: string | null
          company_id?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          custom_fields?: Json | null
          expected_close_date?: string | null
          first_name?: string | null
          full_name: string
          id?: string
          landing_page?: string | null
          language?: string | null
          last_contact_at?: string | null
          last_name?: string | null
          lead_status?: string | null
          lost_reason?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          next_action_at?: string | null
          notes?: string | null
          organization_id?: string | null
          owner_id?: string | null
          pipeline_id?: string | null
          preferred_channel?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          score?: number | null
          score_calculated_at?: string | null
          score_tier?: string | null
          source?: string | null
          stage_id?: string | null
          status?: string
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          ad?: string | null
          adset?: string | null
          birthday?: string | null
          budget?: number | null
          budget_currency?: string
          campaign?: string | null
          city?: string | null
          company_id?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          custom_fields?: Json | null
          expected_close_date?: string | null
          first_name?: string | null
          full_name?: string
          id?: string
          landing_page?: string | null
          language?: string | null
          last_contact_at?: string | null
          last_name?: string | null
          lead_status?: string | null
          lost_reason?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          next_action_at?: string | null
          notes?: string | null
          organization_id?: string | null
          owner_id?: string | null
          pipeline_id?: string | null
          preferred_channel?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          score?: number | null
          score_calculated_at?: string | null
          score_tier?: string | null
          source?: string | null
          stage_id?: string | null
          status?: string
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
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
      facebook_field_mappings: {
        Row: {
          contact_field: string
          created_at: string
          fb_field_name: string
          form_id: string
          id: string
          is_custom_field: boolean
          user_id: string
        }
        Insert: {
          contact_field: string
          created_at?: string
          fb_field_name: string
          form_id: string
          id?: string
          is_custom_field?: boolean
          user_id: string
        }
        Update: {
          contact_field?: string
          created_at?: string
          fb_field_name?: string
          form_id?: string
          id?: string
          is_custom_field?: boolean
          user_id?: string
        }
        Relationships: []
      }
      facebook_lead_forms: {
        Row: {
          created_at: string
          form_id: string
          form_name: string
          form_status: string | null
          id: string
          is_syncing: boolean | null
          page_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          form_id: string
          form_name: string
          form_status?: string | null
          id?: string
          is_syncing?: boolean | null
          page_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          form_id?: string
          form_name?: string
          form_status?: string | null
          id?: string
          is_syncing?: boolean | null
          page_id?: string
          user_id?: string
        }
        Relationships: []
      }
      facebook_messages: {
        Row: {
          contact_id: string | null
          created_at: string
          direction: string
          id: string
          message_id: string
          message_text: string | null
          page_id: string
          sender_id: string
          sender_name: string | null
          sent_at: string
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          message_id: string
          message_text?: string | null
          page_id: string
          sender_id: string
          sender_name?: string | null
          sent_at: string
          user_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          message_id?: string
          message_text?: string | null
          page_id?: string
          sender_id?: string
          sender_name?: string | null
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facebook_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_pages: {
        Row: {
          created_at: string
          id: string
          page_access_token: string
          page_id: string
          page_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          page_access_token: string
          page_id: string
          page_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          page_access_token?: string
          page_id?: string
          page_name?: string
          user_id?: string
        }
        Relationships: []
      }
      facebook_tokens: {
        Row: {
          access_token: string
          connected_at: string
          id: string
          last_refresh_error: string | null
          needs_reconnect: boolean
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          id?: string
          last_refresh_error?: string | null
          needs_reconnect?: boolean
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          id?: string
          last_refresh_error?: string | null
          needs_reconnect?: boolean
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_calendar_tokens: {
        Row: {
          connected_at: string
          id: string
          provider_refresh_token: string | null
          provider_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          id?: string
          provider_refresh_token?: string | null
          provider_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string
          id?: string
          provider_refresh_token?: string | null
          provider_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      meta_campaigns: {
        Row: {
          ad_account_id: string | null
          campaign_id: string
          campaign_name: string
          clicks: number | null
          cpl: number | null
          created_at: string
          daily_budget: number | null
          id: string
          impressions: number | null
          leads: number | null
          lifetime_budget: number | null
          objective: string | null
          spend: number | null
          start_time: string | null
          status: string | null
          stop_time: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_account_id?: string | null
          campaign_id: string
          campaign_name: string
          clicks?: number | null
          cpl?: number | null
          created_at?: string
          daily_budget?: number | null
          id?: string
          impressions?: number | null
          leads?: number | null
          lifetime_budget?: number | null
          objective?: string | null
          spend?: number | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string | null
          campaign_id?: string
          campaign_name?: string
          clicks?: number | null
          cpl?: number | null
          created_at?: string
          daily_budget?: number | null
          id?: string
          impressions?: number | null
          leads?: number | null
          lifetime_budget?: number | null
          objective?: string | null
          spend?: number | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
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
      ai_agent_configs: {
        Row: {
          id: string
          organization_id: string
          is_active: boolean
          agent_name: string
          business_name: string | null
          business_description: string | null
          products: string | null
          faqs: string | null
          tone: string
          escalation_response: string
          off_topic_response: string
          channels: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          is_active?: boolean
          agent_name?: string
          business_name?: string | null
          business_description?: string | null
          products?: string | null
          faqs?: string | null
          tone?: string
          escalation_response?: string
          off_topic_response?: string
          channels?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          is_active?: boolean
          agent_name?: string
          business_name?: string | null
          business_description?: string | null
          products?: string | null
          faqs?: string | null
          tone?: string
          escalation_response?: string
          off_topic_response?: string
          channels?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_agent_paused: {
        Row: {
          id: string
          organization_id: string
          channel: string
          session_key: string
          paused_at: string
        }
        Insert: {
          id?: string
          organization_id?: string
          channel: string
          session_key: string
          paused_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          channel?: string
          session_key?: string
          paused_at?: string
        }
        Relationships: []
      }
      ai_boost_credits: {
        Row: {
          id: string
          organization_id: string
          credits_remaining: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          credits_remaining?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          credits_remaining?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ia_agent_credits: {
        Row: {
          id: string
          organization_id: string
          credits_remaining: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          credits_remaining?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          credits_remaining?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ia_landings_credits: {
        Row: {
          id: string
          organization_id: string
          credits_remaining: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          credits_remaining?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          credits_remaining?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          role?: string
          created_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          id: string
          name: string
          display_order: number | null
          stripe_price_id_monthly: string | null
          stripe_price_id_annual: string | null
          price_monthly: number | null
          price_annual: number | null
          features: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          display_order?: number | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_annual?: string | null
          price_monthly?: number | null
          price_annual?: number | null
          features?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          display_order?: number | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_annual?: string | null
          price_monthly?: number | null
          price_annual?: number | null
          features?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          id: string
          organization_id: string
          period_start: string
          ai_analyses_used: number
          automated_messages_used: number
          email_sends_used: number
          ai_agent_conversations_used: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          period_start: string
          ai_analyses_used?: number
          automated_messages_used?: number
          email_sends_used?: number
          ai_agent_conversations_used?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          period_start?: string
          ai_analyses_used?: number
          automated_messages_used?: number
          email_sends_used?: number
          ai_agent_conversations_used?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_configs: {
        Row: {
          access_token: string
          business_name: string | null
          created_at: string
          display_phone: string | null
          id: string
          is_active: boolean
          phone_number_id: string
          updated_at: string
          user_id: string
          waba_id: string
          webhook_verified: boolean
        }
        Insert: {
          access_token: string
          business_name?: string | null
          created_at?: string
          display_phone?: string | null
          id?: string
          is_active?: boolean
          phone_number_id: string
          updated_at?: string
          user_id: string
          waba_id: string
          webhook_verified?: boolean
        }
        Update: {
          access_token?: string
          business_name?: string | null
          created_at?: string
          display_phone?: string | null
          id?: string
          is_active?: boolean
          phone_number_id?: string
          updated_at?: string
          user_id?: string
          waba_id?: string
          webhook_verified?: boolean
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          contact_id: string | null
          created_at: string
          direction: string
          from_phone_number_id: string | null
          id: string
          media_url: string | null
          message_text: string | null
          message_type: string
          phone_number: string
          read_at: string | null
          sent_at: string
          sent_by_name: string | null
          status: string | null
          user_id: string
          wa_message_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          direction?: string
          from_phone_number_id?: string | null
          id?: string
          media_url?: string | null
          message_text?: string | null
          message_type?: string
          phone_number: string
          read_at?: string | null
          sent_at?: string
          sent_by_name?: string | null
          status?: string | null
          user_id: string
          wa_message_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          direction?: string
          from_phone_number_id?: string | null
          id?: string
          media_url?: string | null
          message_text?: string | null
          message_type?: string
          phone_number?: string
          read_at?: string | null
          sent_at?: string
          sent_by_name?: string | null
          status?: string | null
          user_id?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_oauth_state: {
        Args: { p_provider: string }
        Returns: string
      }
      get_active_subscription: {
        Args: { p_org_id: string }
        Returns: Array<{
          subscription_id: string
          plan_id: string
          plan_name: string
          status: string
          trial_ends_at: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean
          is_active: boolean
          max_users: number | null
          max_contacts: number | null
          max_active_deals: number | null
          monthly_ai_analyses: number | null
          monthly_ai_objections: number | null
          monthly_automated_messages: number | null
          monthly_email_sends: number | null
          monthly_ai_agent_conversations: number | null
          feature_meta_ads: boolean
          feature_ai_agent: boolean
          feature_email_campaigns: boolean
          feature_api_access: boolean
        }>
      }
      get_data_deletion_status: {
        Args: { p_code: string }
        Returns: Array<{
          status: string
          requested_at: string
          processed_at: string | null
          user_email: string | null
        }>
      }
      get_my_organization: {
        Args: Record<string, never>
        Returns: Array<{
          id: string
          name: string
          slug: string
          org_slug: string
          created_at: string
          updated_at: string
          email_from_name: string | null
          email_from_email: string | null
        }>
      }
      get_my_organization_ids: {
        Args: Record<string, never>
        Returns: string[]
      }
      get_org_members: {
        Args: { p_org_id: string }
        Returns: Array<{
          user_id: string
          full_name: string
          email: string
        }>
      }
      get_organization_by_slug: {
        Args: { p_slug: string }
        Returns: Array<{
          id: string
          name: string
          slug: string
          created_at: string
          updated_at: string
          email_from_name: string | null
          email_from_email: string | null
        }>
      }
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
