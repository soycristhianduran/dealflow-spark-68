// CRM Types

export type UserRole = 'admin' | 'manager' | 'sales_rep';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
  status: 'active' | 'inactive';
}

export type ContactStatus = 'new' | 'contacted' | 'qualified' | 'client' | 'lost';

export interface Contact {
  id: string;
  full_name: string;
  primary_phone?: string;
  primary_email?: string;
  company_id?: string;
  preferred_channel?: string;
  language?: string;
  timezone?: string;
  tags?: string[];
  notes?: string;
  last_contact_at?: string;
  next_action_at?: string;
  owner_id?: string;
  status: ContactStatus;
  score?: number;
  source?: string;
  campaign?: string;
  adset?: string;
  ad?: string;
  landing_page?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  country?: string;
  city?: string;
  created_at: string;
  updated_at: string;
  company?: Company;
}

export interface Company {
  id: string;
  name: string;
  industry?: string;
  company_size?: string;
  city?: string;
  country?: string;
  website?: string;
  owner_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  order: number;
  color: string;
  probability: number;
}

export interface Deal {
  id: string;
  title: string;
  contact_id?: string;
  company_id?: string;
  pipeline_id: string;
  stage_id: string;
  owner_id?: string;
  value: number;
  currency: string;
  close_probability?: number;
  expected_close_date?: string;
  source?: string;
  product?: string;
  lost_reason?: string;
  won_reason?: string;
  status: 'open' | 'won' | 'lost';
  created_at: string;
  updated_at: string;
  contact?: Contact;
  stage?: PipelineStage;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  task_type: 'call' | 'whatsapp' | 'email' | 'meeting' | 'follow_up' | 'payment' | 'proposal';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string;
  due_time?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  owner_id?: string;
  contact_id?: string;
  deal_id?: string;
  company_id?: string;
  created_at: string;
  updated_at: string;
  contact?: Contact;
  deal?: Deal;
}

export interface Meeting {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  timezone?: string;
  advisor_id?: string;
  contact_id?: string;
  deal_id?: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  attendance_status?: 'pending' | 'attended' | 'no_show';
  meeting_type?: 'in_person' | 'video_call' | 'phone_call';
  location_or_link?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  contact?: Contact;
}

export interface Activity {
  id: string;
  related_entity_type: 'contact' | 'deal' | 'company' | 'task' | 'meeting';
  related_entity_id: string;
  event_type: 'note' | 'call' | 'whatsapp' | 'email' | 'meeting' | 'stage_change' | 'task_created' | 'deal_created' | 'system';
  event_source?: string;
  summary: string;
  payload?: Record<string, unknown>;
  created_by?: string;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  category: 'follow_up' | 'appointment_confirmation' | 'reactivation' | 'proposal_sent';
  channel: 'whatsapp' | 'email' | 'sms';
  content: string;
  created_at: string;
}
