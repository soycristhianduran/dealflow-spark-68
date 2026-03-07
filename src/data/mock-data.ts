import type { Lead, Contact, Company, Deal, Task, Meeting, Activity, Pipeline, PipelineStage } from '@/types/crm';

const stageColors = [
  'hsl(220, 70%, 50%)',   // new
  'hsl(262, 52%, 47%)',   // contacted
  'hsl(38, 92%, 50%)',    // meeting scheduled
  'hsl(25, 95%, 53%)',    // meeting done
  'hsl(173, 58%, 39%)',   // proposal
  'hsl(199, 89%, 48%)',   // negotiation
  'hsl(142, 71%, 45%)',   // won
  'hsl(0, 72%, 51%)',     // lost
];

export const defaultStages: PipelineStage[] = [
  { id: 's1', pipeline_id: 'p1', name: 'Lead nuevo', order: 1, color: stageColors[0], probability: 10 },
  { id: 's2', pipeline_id: 'p1', name: 'Contactado', order: 2, color: stageColors[1], probability: 20 },
  { id: 's3', pipeline_id: 'p1', name: 'Cita agendada', order: 3, color: stageColors[2], probability: 35 },
  { id: 's4', pipeline_id: 'p1', name: 'Cita realizada', order: 4, color: stageColors[3], probability: 50 },
  { id: 's5', pipeline_id: 'p1', name: 'Propuesta enviada', order: 5, color: stageColors[4], probability: 65 },
  { id: 's6', pipeline_id: 'p1', name: 'Negociación', order: 6, color: stageColors[5], probability: 80 },
  { id: 's7', pipeline_id: 'p1', name: 'Cerrado ganado', order: 7, color: stageColors[6], probability: 100 },
  { id: 's8', pipeline_id: 'p1', name: 'Cerrado perdido', order: 8, color: stageColors[7], probability: 0 },
];

export const defaultPipeline: Pipeline = {
  id: 'p1',
  name: 'Pipeline principal',
  stages: defaultStages,
};

export const mockLeads: Lead[] = [
  { id: 'l1', first_name: 'Carlos', last_name: 'Mendoza', full_name: 'Carlos Mendoza', phone: '+52 55 1234 5678', email: 'carlos@email.com', country: 'México', city: 'CDMX', source: 'Facebook Ads', campaign: 'Q1 Real Estate', status: 'new', score: 72, created_at: '2026-03-05T10:00:00Z', updated_at: '2026-03-05T10:00:00Z' },
  { id: 'l2', first_name: 'Ana', last_name: 'García', full_name: 'Ana García', phone: '+34 612 345 678', email: 'ana@email.com', country: 'España', city: 'Madrid', source: 'Google Ads', campaign: 'Clínica Dental', status: 'contacted', score: 85, created_at: '2026-03-04T08:00:00Z', updated_at: '2026-03-06T14:00:00Z' },
  { id: 'l3', first_name: 'Roberto', last_name: 'Silva', full_name: 'Roberto Silva', phone: '+55 11 9876 5432', email: 'roberto@email.com', country: 'Brasil', city: 'São Paulo', source: 'Referral', status: 'qualified', score: 91, created_at: '2026-03-03T12:00:00Z', updated_at: '2026-03-06T09:00:00Z' },
  { id: 'l4', first_name: 'María', last_name: 'López', full_name: 'María López', phone: '+57 311 234 5678', email: 'maria@email.com', country: 'Colombia', city: 'Bogotá', source: 'Landing Page', status: 'new', score: 45, created_at: '2026-03-06T16:00:00Z', updated_at: '2026-03-06T16:00:00Z' },
  { id: 'l5', first_name: 'Javier', last_name: 'Ruiz', full_name: 'Javier Ruiz', phone: '+1 305 555 0100', email: 'javier@email.com', country: 'USA', city: 'Miami', source: 'WhatsApp', status: 'converted', score: 95, created_at: '2026-03-01T09:00:00Z', updated_at: '2026-03-05T11:00:00Z' },
];

export const mockCompanies: Company[] = [
  { id: 'co1', name: 'Inmobiliaria del Norte', industry: 'Real Estate', company_size: '11-50', city: 'Monterrey', country: 'México', website: 'https://inmobiliarianorte.com', created_at: '2026-02-15T10:00:00Z', updated_at: '2026-02-15T10:00:00Z' },
  { id: 'co2', name: 'Clínica Dental Sonrisa', industry: 'Healthcare', company_size: '1-10', city: 'Madrid', country: 'España', website: 'https://sonrisa.es', created_at: '2026-02-20T10:00:00Z', updated_at: '2026-02-20T10:00:00Z' },
  { id: 'co3', name: 'EduTech Solutions', industry: 'Education', company_size: '51-200', city: 'São Paulo', country: 'Brasil', created_at: '2026-02-25T10:00:00Z', updated_at: '2026-02-25T10:00:00Z' },
];

export const mockContacts: Contact[] = [
  { id: 'c1', full_name: 'Carlos Mendoza', primary_phone: '+52 55 1234 5678', primary_email: 'carlos@email.com', company_id: 'co1', preferred_channel: 'whatsapp', tags: ['vip', 'real-estate'], owner_id: 'u1', last_contact_at: '2026-03-06T14:00:00Z', next_action_at: '2026-03-08T10:00:00Z', created_at: '2026-03-01T10:00:00Z', updated_at: '2026-03-06T14:00:00Z', company: mockCompanies[0] },
  { id: 'c2', full_name: 'Ana García', primary_phone: '+34 612 345 678', primary_email: 'ana@email.com', company_id: 'co2', preferred_channel: 'email', tags: ['healthcare'], owner_id: 'u1', last_contact_at: '2026-03-05T10:00:00Z', created_at: '2026-03-02T10:00:00Z', updated_at: '2026-03-05T10:00:00Z', company: mockCompanies[1] },
  { id: 'c3', full_name: 'Roberto Silva', primary_phone: '+55 11 9876 5432', primary_email: 'roberto@email.com', company_id: 'co3', preferred_channel: 'phone', tags: ['education', 'enterprise'], owner_id: 'u1', created_at: '2026-03-03T10:00:00Z', updated_at: '2026-03-03T10:00:00Z', company: mockCompanies[2] },
  { id: 'c4', full_name: 'María López', primary_phone: '+57 311 234 5678', primary_email: 'maria@email.com', preferred_channel: 'whatsapp', tags: ['new'], created_at: '2026-03-04T10:00:00Z', updated_at: '2026-03-04T10:00:00Z' },
];

export const mockDeals: Deal[] = [
  { id: 'd1', title: 'Departamento Torre Norte', contact_id: 'c1', company_id: 'co1', pipeline_id: 'p1', stage_id: 's5', value: 250000, currency: 'USD', close_probability: 65, expected_close_date: '2026-04-15', source: 'Facebook Ads', product: 'Depto 3 recámaras', status: 'open', created_at: '2026-03-01T10:00:00Z', updated_at: '2026-03-06T10:00:00Z', contact: mockContacts[0], stage: defaultStages[4] },
  { id: 'd2', title: 'Tratamiento ortodoncia premium', contact_id: 'c2', company_id: 'co2', pipeline_id: 'p1', stage_id: 's3', value: 4500, currency: 'EUR', close_probability: 35, expected_close_date: '2026-03-20', source: 'Google Ads', product: 'Ortodoncia invisible', status: 'open', created_at: '2026-03-02T10:00:00Z', updated_at: '2026-03-05T10:00:00Z', contact: mockContacts[1], stage: defaultStages[2] },
  { id: 'd3', title: 'Licencia plataforma educativa', contact_id: 'c3', company_id: 'co3', pipeline_id: 'p1', stage_id: 's6', value: 85000, currency: 'USD', close_probability: 80, expected_close_date: '2026-03-30', source: 'Referral', product: 'Enterprise License', status: 'open', created_at: '2026-02-25T10:00:00Z', updated_at: '2026-03-06T10:00:00Z', contact: mockContacts[2], stage: defaultStages[5] },
  { id: 'd4', title: 'Consultoría digital', contact_id: 'c4', pipeline_id: 'p1', stage_id: 's1', value: 12000, currency: 'USD', close_probability: 10, source: 'Landing Page', status: 'open', created_at: '2026-03-06T10:00:00Z', updated_at: '2026-03-06T10:00:00Z', contact: mockContacts[3], stage: defaultStages[0] },
  { id: 'd5', title: 'Casa residencial Polanco', contact_id: 'c1', company_id: 'co1', pipeline_id: 'p1', stage_id: 's7', value: 450000, currency: 'USD', close_probability: 100, won_reason: 'Precio competitivo', status: 'won', created_at: '2026-02-01T10:00:00Z', updated_at: '2026-03-01T10:00:00Z', contact: mockContacts[0], stage: defaultStages[6] },
];

export const mockTasks: Task[] = [
  { id: 't1', title: 'Llamar a Carlos - seguimiento propuesta', task_type: 'call', priority: 'high', due_date: '2026-03-07', due_time: '10:00', status: 'pending', contact_id: 'c1', deal_id: 'd1', created_at: '2026-03-06T10:00:00Z', updated_at: '2026-03-06T10:00:00Z', contact: mockContacts[0] },
  { id: 't2', title: 'Enviar propuesta clínica dental', task_type: 'proposal', priority: 'medium', due_date: '2026-03-07', due_time: '14:00', status: 'pending', contact_id: 'c2', deal_id: 'd2', created_at: '2026-03-05T10:00:00Z', updated_at: '2026-03-05T10:00:00Z', contact: mockContacts[1] },
  { id: 't3', title: 'WhatsApp a María - confirmar interés', task_type: 'whatsapp', priority: 'medium', due_date: '2026-03-07', due_time: '11:00', status: 'pending', contact_id: 'c4', deal_id: 'd4', created_at: '2026-03-06T10:00:00Z', updated_at: '2026-03-06T10:00:00Z', contact: mockContacts[3] },
  { id: 't4', title: 'Preparar contrato EduTech', task_type: 'follow_up', priority: 'urgent', due_date: '2026-03-06', due_time: '16:00', status: 'pending', contact_id: 'c3', deal_id: 'd3', created_at: '2026-03-04T10:00:00Z', updated_at: '2026-03-04T10:00:00Z', contact: mockContacts[2] },
  { id: 't5', title: 'Email seguimiento Ana García', task_type: 'email', priority: 'low', due_date: '2026-03-08', status: 'completed', contact_id: 'c2', created_at: '2026-03-03T10:00:00Z', updated_at: '2026-03-06T10:00:00Z', contact: mockContacts[1] },
];

export const mockMeetings: Meeting[] = [
  { id: 'm1', title: 'Presentación Torre Norte', start_at: '2026-03-07T10:00:00Z', end_at: '2026-03-07T11:00:00Z', advisor_id: 'u1', contact_id: 'c1', deal_id: 'd1', status: 'scheduled', attendance_status: 'pending', meeting_type: 'video_call', location_or_link: 'https://meet.google.com/abc', created_at: '2026-03-05T10:00:00Z', updated_at: '2026-03-05T10:00:00Z', contact: mockContacts[0] },
  { id: 'm2', title: 'Consulta ortodoncia', start_at: '2026-03-07T15:00:00Z', end_at: '2026-03-07T15:30:00Z', advisor_id: 'u1', contact_id: 'c2', deal_id: 'd2', status: 'scheduled', attendance_status: 'pending', meeting_type: 'in_person', location_or_link: 'Clínica Sonrisa, Madrid', created_at: '2026-03-04T10:00:00Z', updated_at: '2026-03-04T10:00:00Z', contact: mockContacts[1] },
  { id: 'm3', title: 'Demo plataforma EduTech', start_at: '2026-03-08T14:00:00Z', end_at: '2026-03-08T15:00:00Z', advisor_id: 'u1', contact_id: 'c3', deal_id: 'd3', status: 'scheduled', meeting_type: 'video_call', location_or_link: 'https://zoom.us/j/123', created_at: '2026-03-06T10:00:00Z', updated_at: '2026-03-06T10:00:00Z', contact: mockContacts[2] },
  { id: 'm4', title: 'Llamada inicial María', start_at: '2026-03-10T09:00:00Z', end_at: '2026-03-10T09:30:00Z', advisor_id: 'u1', contact_id: 'c4', deal_id: 'd4', status: 'scheduled', meeting_type: 'phone_call', created_at: '2026-03-06T10:00:00Z', updated_at: '2026-03-06T10:00:00Z', contact: mockContacts[3] },
];

export const mockActivities: Activity[] = [
  { id: 'a1', related_entity_type: 'deal', related_entity_id: 'd1', event_type: 'stage_change', summary: 'Deal movido a "Propuesta enviada"', created_by: 'u1', created_at: '2026-03-06T10:00:00Z' },
  { id: 'a2', related_entity_type: 'contact', related_entity_id: 'c1', event_type: 'call', summary: 'Llamada de 15 min - interesado en financiamiento', created_by: 'u1', created_at: '2026-03-06T09:00:00Z' },
  { id: 'a3', related_entity_type: 'deal', related_entity_id: 'd2', event_type: 'note', summary: 'Cliente prefiere cita presencial para evaluación', created_by: 'u1', created_at: '2026-03-05T14:00:00Z' },
  { id: 'a4', related_entity_type: 'contact', related_entity_id: 'c3', event_type: 'email', summary: 'Enviado catálogo de precios enterprise', created_by: 'u1', created_at: '2026-03-05T11:00:00Z' },
  { id: 'a5', related_entity_type: 'deal', related_entity_id: 'd3', event_type: 'meeting', summary: 'Reunión de negociación - solicitan descuento 10%', created_by: 'u1', created_at: '2026-03-04T15:00:00Z' },
  { id: 'a6', related_entity_type: 'contact', related_entity_id: 'c2', event_type: 'whatsapp', summary: 'Confirmó disponibilidad para cita el viernes', created_by: 'u1', created_at: '2026-03-04T10:00:00Z' },
  { id: 'a7', related_entity_type: 'deal', related_entity_id: 'd5', event_type: 'stage_change', summary: 'Deal marcado como "Cerrado ganado" 🎉', created_by: 'u1', created_at: '2026-03-01T10:00:00Z' },
  { id: 'a8', related_entity_type: 'deal', related_entity_id: 'd4', event_type: 'deal_created', summary: 'Nuevo deal creado: Consultoría digital', created_by: 'u1', created_at: '2026-03-06T10:00:00Z' },
];

export const dashboardStats = {
  leadsCreated: 24,
  contactsCreated: 18,
  dealsOpen: 4,
  dealsWon: 3,
  dealsLost: 1,
  pipelineValue: 351500,
  meetingsScheduled: 8,
  meetingsCompleted: 5,
  noShows: 1,
  tasksPending: 12,
};
