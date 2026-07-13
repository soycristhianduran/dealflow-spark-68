// ══════════════════════════════════════════════════════════════════════
//  AutomationsPage — Visual Flow Builder (n8n-style)
// ══════════════════════════════════════════════════════════════════════
import "@xyflow/react/dist/style.css";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import React, { useState, useEffect, useCallback, useContext, createContext, useMemo } from "react";
import {
  ReactFlow, Background, Controls, Panel,
  useNodesState, useEdgesState,
  Handle, Position, MarkerType, BackgroundVariant,
  getBezierPath, BaseEdge, EdgeLabelRenderer,
  type Node, type Edge, type NodeProps, type EdgeProps,
} from "@xyflow/react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagPicker } from "@/components/TagPicker";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { AUTOMATION_TEMPLATES, TEMPLATE_CATEGORIES, templateToAutomation } from "@/lib/automationTemplates";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import {
  Zap, Plus, Trash2, Edit, ArrowLeft, Save, Play, Users,
  Clock, Tag, User, X, ChevronDown,
  Info, Settings2, FileText, Search,
  Bell, UserCheck, Timer, PhoneCall,
  CheckSquare2, CheckCircle2, Mail, Share2, Cake,
} from "lucide-react";

// ── Brand / custom SVG icons ──────────────────────────────────────────────────
function IconWhatsApp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  );
}

function IconEmail({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="m2 7 8.586 5.586a2 2 0 0 0 2.828 0L22 7"/>
    </svg>
  );
}

function IconWebhook({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/>
      <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/>
      <path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/>
    </svg>
  );
}

function IconCondition({ className }: { className?: string }) {
  // Diamond shape = classic decision/condition icon (like flowchart)
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 L22 12 L12 22 L2 12 Z"/>
      <path d="M12 8 v8M8 12 h8"/>
    </svg>
  );
}

function IconPipeline({ className }: { className?: string }) {
  // Funnel/filter = pipeline stages icon
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>
    </svg>
  );
}

function IconNotify({ className }: { className?: string }) {
  // Bell + alert dot = vendor notification
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
    </svg>
  );
}

// ── Error boundary ────────────────────────────────────────────────────────────
class BuilderErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  override render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 max-w-lg w-full">
            <p className="font-semibold text-red-700 mb-2">Error al cargar el builder</p>
            <p className="text-sm text-red-600 mb-3">{this.state.error.message}</p>
            <pre className="text-xs bg-white rounded p-2 overflow-auto max-h-40 text-red-500 border border-red-100">
              {this.state.error.stack}
            </pre>
            <button
              className="mt-3 text-xs text-red-500 underline"
              onClick={() => this.setState({ error: null })}
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AutomationStep {
  id: string;
  type: "wait" | "send_email" | "send_whatsapp" | "add_tag" | "remove_tag" | "update_contact" | "condition" | "assign_owner" | "move_pipeline_stage" | "create_task" | "send_webhook" | "notify_owner" | "make_call" | "enroll_automation" | "send_whatsapp_interactive" | "wait_reply" | "reply_condition" | "send_whatsapp_flow" | "reply_switch" | "end_flow";
  config: Record<string, any>;
  // Optional free-canvas position (ignored by automation-runner)
  position?: { x: number; y: number };
}

interface Automation {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  trigger_type: string;
  trigger_config: Record<string, any>;
  triggers?: { type: string; config: Record<string, any> }[];
  trigger_types?: string[];
  steps: AutomationStep[];
  created_at: string;
  updated_at: string;
  _enrollment_count?: number;
}

/** Data payload carried by a step node in the React Flow DnD data map */
interface StepNodeData {
  step: AutomationStep;
  [key: string]: unknown;
}

/** Data payload carried by an addable edge in the React Flow DnD data map */
interface EdgeNodeData {
  insertIndex?: number;
  [key: string]: unknown;
}

// ── Step metadata ─────────────────────────────────────────────────────────────
const STEP_META: Record<string, {
  label: string; description: string; icon: React.ElementType;
  color: string; bg: string; border: string; ring: string;
}> = {
  wait:                { label: "Esperar",            description: "Pausa el flujo por un tiempo determinado",      icon: Timer,         color: "#78716c", bg: "#fafaf9", border: "#e7e5e4", ring: "#f5f5f4" },
  send_email:          { label: "Enviar Email",        description: "Envía un email personalizado al contacto",      icon: IconEmail,     color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", ring: "#dbeafe" },
  send_whatsapp:       { label: "Enviar WhatsApp",     description: "Envía una plantilla aprobada de WhatsApp",      icon: IconWhatsApp,  color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", ring: "#dcfce7" },
  add_tag:             { label: "Añadir etiqueta",     description: "Agrega una etiqueta al contacto",               icon: Tag,           color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", ring: "#ede9fe" },
  remove_tag:          { label: "Quitar etiqueta",     description: "Elimina una etiqueta del contacto",             icon: Tag,           color: "#64748b", bg: "#f8fafc", border: "#e2e8f0", ring: "#f1f5f9" },
  update_contact:      { label: "Actualizar contacto", description: "Modifica campos del perfil del contacto",       icon: User,          color: "#0891b2", bg: "#f0f9ff", border: "#bae6fd", ring: "#e0f2fe" },
  condition:           { label: "Condición If/Else",   description: "Bifurca el flujo según una condición",          icon: IconCondition, color: "#d97706", bg: "#fffbeb", border: "#fde68a", ring: "#fef3c7" },
  assign_owner:        { label: "Asignar vendedor",    description: "Asigna un responsable al contacto",             icon: UserCheck,     color: "#0369a1", bg: "#f0f9ff", border: "#bae6fd", ring: "#e0f2fe" },
  move_pipeline_stage: { label: "Mover en pipeline",   description: "Cambia la etapa del contacto en el pipeline",   icon: IconPipeline,  color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", ring: "#dcfce7" },
  create_task:         { label: "Crear tarea",          description: "Crea una tarea asignada al vendedor",           icon: CheckSquare2,  color: "#6d28d9", bg: "#f5f3ff", border: "#ddd6fe", ring: "#ede9fe" },
  send_webhook:        { label: "Webhook / HTTP",       description: "Llama a una URL externa (n8n, Zapier, Make…)", icon: IconWebhook,   color: "#374151", bg: "#f9fafb", border: "#e5e7eb", ring: "#f3f4f6" },
  notify_owner:        { label: "Notificar vendedor",   description: "Envía un email de alerta al responsable",       icon: IconNotify,    color: "#b45309", bg: "#fffbeb", border: "#fde68a", ring: "#fef3c7" },
  make_call:           { label: "Llamar al contacto",   description: "El agente IA llama al contacto automáticamente", icon: PhoneCall,     color: "#0f766e", bg: "#f0fdfa", border: "#99f6e4", ring: "#ccfbf1" },
  enroll_automation:   { label: "Ir a otra automatización", description: "Envía el contacto a otra automatización",    icon: Share2,        color: "#9333ea", bg: "#faf5ff", border: "#e9d5ff", ring: "#f3e8ff" },
  send_whatsapp_interactive: { label: "Mensaje con botones", description: "Mensaje libre de WhatsApp con hasta 3 botones (bot)", icon: IconWhatsApp, color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", ring: "#d1fae5" },
  wait_reply:          { label: "Esperar respuesta",   description: "Pausa hasta que el contacto responda (o venza el plazo)", icon: Timer,   color: "#0d9488", bg: "#f0fdfa", border: "#99f6e4", ring: "#ccfbf1" },
  reply_condition:     { label: "Según la respuesta",  description: "Bifurca el flujo según lo que respondió el contacto",     icon: IconCondition, color: "#c2410c", bg: "#fff7ed", border: "#fed7aa", ring: "#ffedd5" },
  send_whatsapp_flow:  { label: "Enviar WhatsApp Flow", description: "Formulario nativo de WhatsApp (creado en Meta Flow Builder)", icon: IconWhatsApp, color: "#047857", bg: "#ecfdf5", border: "#a7f3d0", ring: "#d1fae5" },
  reply_switch:        { label: "Ramas por respuesta", description: "Un camino distinto por cada botón o respuesta del contacto", icon: IconCondition, color: "#9a3412", bg: "#fff7ed", border: "#fed7aa", ring: "#ffedd5" },
  end_flow:            { label: "Fin de rama",          description: "Termina el flujo en este punto (cierre de una rama)",        icon: Timer,         color: "#475569", bg: "#f8fafc", border: "#e2e8f0", ring: "#f1f5f9" },
};

// ── Step groups for organized picker ──────────────────────────────────────────
const STEP_GROUPS: { label: string; types: string[] }[] = [
  { label: "Comunicación",  types: ["send_email", "send_whatsapp", "notify_owner", "make_call"] },
  { label: "Contacto",      types: ["add_tag", "remove_tag", "update_contact", "assign_owner"] },
  { label: "Pipeline",      types: ["move_pipeline_stage", "create_task"] },
  { label: "Control",       types: ["wait", "condition", "send_webhook"] },
  { label: "Bot de WhatsApp", types: ["send_whatsapp_interactive", "send_whatsapp_flow"] },
  { label: "Flujo",         types: ["enroll_automation"] },
];

const TRIGGER_LABELS: Record<string, string> = {
  manual:                  "Manual",
  contact_created:         "Contacto creado",
  tag_added:               "Tag añadido",
  contact_stage_changed:   "Etapa de lead cambiada",
  meeting_scheduled:       "Cita agendada",
  meeting_rescheduled:     "Cita reagendada",
  whatsapp_incoming:       "WhatsApp entrante",
  scheduled:               "Programado",
  contact_date:            "Fecha del contacto (cumpleaños / renovación)",
  meta_lead_form:          "Formulario de Meta Lead Ads",
  landing_form_submitted:  "Formulario de Landing Page",
  email_opened:            "Email abierto",
  email_clicked:           "Email — link cliqueado",
  abandoned_cart:          "Carrito abandonado (Shopify)",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function genId() { return Math.random().toString(36).slice(2, 10); }

// Module-level ref so AddableEdge can always call the live callback even after
// React Flow's internal edge state strips function references from edge.data.
let _onInsertStep: ((idx: number) => void) | null = null;

function defaultConfig(type: AutomationStep["type"]): Record<string, any> {
  switch (type) {
    case "wait":           return { delay_value: 1, delay_unit: "days" };
    case "send_email":     return { subject: "", html_content: "", from_name: "", from_email: "" };
    case "send_whatsapp":  return { template_name: "", language: "es", variables: [] };
    case "add_tag":             return { tag: "" };
    case "remove_tag":          return { tag: "" };
    case "update_contact":      return { field: "", value: "" };
    case "condition":           return { field: "tags", operator: "contains", value: "" };
    case "send_whatsapp_interactive": return { body_text: "", buttons: ["", "", ""] };
    case "wait_reply":          return { timeout_value: 24, timeout_unit: "hours" };
    case "reply_condition":     return { operator: "contains", value: "", false_skip_count: 1 };
    case "send_whatsapp_flow":  return { flow_id: "", cta_text: "Abrir formulario", body_text: "", screen: "" };
    case "reply_switch":        return { cases: [{ match: "", next_index: 0 }, { match: "", next_index: 0 }] };
    case "end_flow":            return {};
    case "assign_owner":        return { mode: "specific", owner_id: "", owner_name: "", owner_ids: [], owner_names: [] };
    case "move_pipeline_stage": return { pipeline_id: "", stage_id: "", stage_name: "" };
    case "create_task":         return { title: "", due_in_days: 1, assign_to_owner: true };
    case "send_webhook":        return { url: "", method: "POST", include_contact: true };
    case "notify_owner":        return { message: "Nuevo evento en contacto {{contact.name}}" };
    case "make_call":           return { calling_agent_id: "" };
    case "enroll_automation":   return { automation_id: "", automation_name: "" };
    default:                    return {};
  }
}

function stepSummary(step: AutomationStep): string {
  const c = step.config || {};
  switch (step.type) {
    case "wait":           return c.mode === "until_date"
                             ? (c.until_date ? `Hasta ${new Date(c.until_date).toLocaleString()}` : "Sin fecha")
                             : c.mode === "contact_date"
                             ? (c.date_field ? `Fecha: ${c.date_field.replace("custom:", "")}` : "Sin campo")
                             : `${c.delay_value} ${c.delay_unit}`;
    case "send_email":     return c.subject ? `"${c.subject}"` : "(sin asunto)";
    case "send_whatsapp":  return c.template_name || "(sin plantilla)";
    case "add_tag":             return c.tag ? `"${c.tag}"` : "(sin tag)";
    case "remove_tag":          return c.tag ? `"${c.tag}"` : "(sin tag)";
    case "update_contact":      return c.field ? `${c.field} = ${c.value}` : "(sin campo)";
    case "condition":           return `${c.field} ${c.operator} ${c.value || "?"}`;
    case "send_whatsapp_interactive": {
      const nb = (c.buttons || []).filter((x: string) => x && x.trim()).length;
      return c.body_text ? `"${String(c.body_text).slice(0, 30)}…" (${nb} botones)` : "(sin mensaje)";
    }
    case "wait_reply":          return `hasta ${c.timeout_value ?? 24} ${c.timeout_unit ?? "hours"}`;
    case "reply_condition":     return `respuesta ${c.operator ?? "contains"} "${c.value || "?"}"`;
    case "send_whatsapp_flow":  return c.flow_id ? `Flow ${c.flow_id}` : "(sin flow)";
    case "reply_switch": {
      const cs = (c.cases || []).filter((x: any) => x.match);
      return cs.length ? cs.map((x: any) => `"${x.match}"→${x.next_index}`).join("  ") : "(sin ramas)";
    }
    case "end_flow":            return "Termina el flujo aquí";
    case "assign_owner":
      if (c.mode === "round_robin") return c.owner_names?.length ? `Round Robin (${c.owner_names.length})` : "Round Robin";
      return c.owner_name ? `→ ${c.owner_name}` : "(sin asignar)";
    case "move_pipeline_stage": return c.stage_name ? `→ ${c.stage_name}` : "(sin etapa)";
    case "create_task":         return c.title ? `"${c.title}"` : "(sin título)";
    case "send_webhook":        return c.url ? c.url.replace(/^https?:\/\//, "") : "(sin URL)";
    case "notify_owner":        return "Email al vendedor asignado";
    case "make_call":           return c.calling_agent_id ? "Agente configurado" : "(sin agente)";
    case "enroll_automation":   return c.automation_name ? `→ ${c.automation_name}` : "(sin seleccionar)";
    default:                    return "";
  }
}

// ── Flow context (shared callbacks between nodes/edges and builder) ────────────
interface FlowActions {
  onInsertStep: (index: number) => void;
  onAddBranchStep: (whatsappStepId: string, buttonMatch: string) => void;
  onSelectNode: (id: string | null) => void;
  onDeleteStep: (id: string) => void;
  selectedId: string | null;
  triggerType: string;
  triggerConfig: Record<string, any>;
  triggers: { type: string; config: Record<string, any> }[];
  steps: AutomationStep[];
}
const FlowCtx = createContext<FlowActions>({
  onInsertStep: () => {}, onAddBranchStep: () => {}, onSelectNode: () => {}, onDeleteStep: () => {},
  selectedId: null, triggerType: "manual", triggerConfig: {}, triggers: [], steps: [],
});

// ── Layout ────────────────────────────────────────────────────────────────────
const NODE_W = 268;
const V_GAP   = 150;
const CX      = 0; // default horizontal center for new nodes

type NodePositions = Record<string, { x: number; y: number }>;

function buildFlow(
  steps: AutomationStep[],
  positions: NodePositions,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Trigger node — use saved position or default
  const triggerPos = positions["trigger"] ?? { x: CX - NODE_W / 2, y: 0 };
  nodes.push({
    id: "trigger",
    type: "triggerNode",
    position: triggerPos,
    data: {},
    selectable: true,
    draggable: true,
  });

  // Ramas por botón: qué pasos son destino y cuáles son fuente de ramas.
  const branchTargets = new Set<number>();
  const branchSources = new Map<number, any>();
  steps.forEach((s, i) => {
    if (s.type === "send_whatsapp" && s.config?.branches?.enabled) {
      const br = s.config.branches;
      branchSources.set(i, br);
      (br.cases ?? []).forEach((c: any) => { if (c?.next_index != null) branchTargets.add(Number(c.next_index)); });
      if (br.default_next_index != null) branchTargets.add(Number(br.default_next_index));
      if (br.no_reply_next_index != null) branchTargets.add(Number(br.no_reply_next_index));
    }
  });

  // Auto-acomodo: cada destino de rama se coloca DEBAJO de su mensaje, esparcido
  // horizontalmente (flujo vertical, como el dibujo). El usuario puede reacomodar.
  const autoPos: Record<string, { x: number; y: number }> = {};
  branchSources.forEach((br: any, i: number) => {
    const wpos = positions[steps[i].id] ?? steps[i].position ?? { x: CX - NODE_W / 2, y: (i + 1) * V_GAP };
    const targets: number[] = [];
    (br.cases ?? []).forEach((c: any) => { if (c?.next_index != null) targets.push(Number(c.next_index)); });
    if (br.default_next_index != null) targets.push(Number(br.default_next_index));
    if (br.no_reply_next_index != null) targets.push(Number(br.no_reply_next_index));
    const uniq = [...new Set(targets)].filter(t => t >= 0 && t < steps.length);
    const N = uniq.length;
    uniq.forEach((t, k) => {
      const spread = (k - (N - 1) / 2) * (NODE_W + 70);
      autoPos[steps[t].id] = { x: wpos.x + spread, y: wpos.y + V_GAP + 30 };
    });
  });

  steps.forEach((step, i) => {
    const defaultPos = { x: CX - NODE_W / 2, y: (i + 1) * V_GAP };
    const pos = positions[step.id] ?? step.position ?? autoPos[step.id] ?? defaultPos;
    nodes.push({
      id: step.id,
      type: "stepNode",
      position: pos,
      data: { step, branchSource: branchSources.get(i) ?? null },
      selectable: true,
      draggable: true,
    });

    // Edge lineal normal — salvo que este paso sea destino de una rama, o que el
    // paso anterior sea una fuente de ramas (su flujo va por las ramas).
    const prevIsBranchSource = i > 0 && branchSources.has(i - 1);
    const isBranchTarget = branchTargets.has(i);
    if (!prevIsBranchSource && !isBranchTarget) {
      const src = i === 0 ? "trigger" : steps[i - 1].id;
      edges.push(makeEdge(src, step.id, i));
    }
  });

  // Dibujar las ramas: una línea etiquetada de cada botón (y otra/sin respuesta)
  // hacia su paso destino.
  branchSources.forEach((br: any, i: number) => {
    const srcId = steps[i].id;
    const btns: string[] = steps[i].config?._buttons ?? [];
    const addBranch = (targetIdx: any, label: string, handle: string, color: string, dashed: boolean) => {
      const ti = Number(targetIdx);
      if (targetIdx == null || isNaN(ti) || ti < 0 || ti >= steps.length) return;
      edges.push({
        id: `br-${srcId}-${handle}`,
        source: srcId,
        sourceHandle: handle,
        target: steps[ti].id,
        type: "branchEdge",
        data: { label },
        style: { stroke: color, strokeWidth: 2, ...(dashed ? { strokeDasharray: "5 3" } : {}) },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      });
    };
    (br.cases ?? []).forEach((c: any) => {
      const bi = btns.indexOf(c.match);
      addBranch(c.next_index, c.match, `br-btn-${bi >= 0 ? bi : c.match}`, "#059669", false);
    });
    if (br.default_next_index != null) addBranch(br.default_next_index, "Otra respuesta", "br-default", "#94a3b8", true);
    if (br.no_reply_next_index != null) addBranch(br.no_reply_next_index, "Sin respuesta", "br-noreply", "#94a3b8", true);
  });

  // End node — always sits below the lowest node so it doesn't overlap
  const allYs = [
    triggerPos.y,
    ...steps.map((s, i) => (positions[s.id] ?? s.position ?? { y: (i + 1) * V_GAP }).y),
  ];
  const endY = Math.max(...allYs) + V_GAP;
  nodes.push({
    id: "end",
    type: "endNode",
    // Posición guardada si el usuario lo movió; si no, debajo del último nodo.
    position: positions["end"] ?? { x: CX - NODE_W / 2, y: endY },
    data: {},
    selectable: false,
    draggable: true,
  });

  const lastSrc = steps.length > 0 ? steps[steps.length - 1].id : "trigger";
  edges.push(makeEdge(lastSrc, "end", steps.length));

  return { nodes, edges };
}

function makeEdge(src: string, tgt: string, insertIndex: number): Edge {
  return {
    id: `e-${src}-${tgt}`,
    source: src,
    target: tgt,
    type: "addableEdge",
    data: { insertIndex },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8", width: 18, height: 18 },
    style: { stroke: "#cbd5e1", strokeWidth: 2 },
  };
}

// ── Custom: Trigger node ──────────────────────────────────────────────────────
function TriggerNode(_: NodeProps) {
  const { t } = useTranslation();
  const { selectedId, triggerType, triggerConfig, triggers } = useContext(FlowCtx);
  const isSelected = selectedId === "trigger";

  // Multi-trigger: show every configured trigger (OR logic). Fall back to the
  // single trigger for legacy state.
  const list = (triggers && triggers.length)
    ? triggers
    : [{ type: triggerType, config: triggerConfig }];

  return (
    <div
      className="cursor-grab active:cursor-grabbing rounded-xl border-2 bg-white shadow-md transition-all hover:shadow-lg"
      style={{
        width: NODE_W,
        borderColor: isSelected ? "#6366f1" : "#a5b4fc",
        boxShadow: isSelected ? "0 0 0 3px #e0e7ff" : undefined,
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3 rounded-t-xl" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
        <Zap className="h-4 w-4 text-white" />
        <span className="text-sm font-semibold text-white">
          {list.length > 1 ? t("automationsPage.triggersAny") : t("automationsPage.startTrigger")}
        </span>
        {isSelected && <span className="ml-auto text-xs text-indigo-200">{t("automationsPage.configArrow")}</span>}
      </div>
      <div className="px-4 py-2.5 space-y-1.5">
        {list.map((tr, i) => {
          const cfg = tr.config || {};
          const sub = tr.type === "meta_lead_form"
            ? (cfg.form_name ? `📋 ${cfg.form_name}` : t("automationsPage.noForm"))
            : tr.type === "tag_added" ? (cfg.tag ? t("automationsPage.tagSub", { tag: cfg.tag }) : "")
            : tr.type === "contact_stage_changed" ? (cfg.stage_name ? t("automationsPage.stageSub", { stage: cfg.stage_name }) : "")
            : tr.type === "scheduled" ? (cfg.cron_expression ? describeCron(cfg.cron_expression) : t("automationsPage.notConfigured"))
            : tr.type === "contact_created" ? (cfg.source && cfg.source !== "any" ? t("automationsPage.sourceSub", { source: cfg.source }) : "")
            : null;
          return (
            <div key={i}>
              {i > 0 && (
                <div className="flex items-center gap-2 py-1">
                  <span className="h-px flex-1 bg-slate-100" />
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-500">{t("automationsPage.orLabel")}</span>
                  <span className="h-px flex-1 bg-slate-100" />
                </div>
              )}
              <p className="text-xs font-semibold text-slate-700">{TRIGGER_LABELS[tr.type] || tr.type}</p>
              {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
            </div>
          );
        })}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

// ── Custom: Step node ─────────────────────────────────────────────────────────
function StepNode({ data }: NodeProps) {
  const { onSelectNode, onDeleteStep, selectedId, steps, onAddBranchStep, onInsertStep } = useContext(FlowCtx);
  const step = (data as StepNodeData).step;
  // Defensive: fall back to "wait" metadata if type is unknown
  const meta = STEP_META[step?.type] ?? STEP_META["wait"];
  const Icon = meta.icon;
  const isSelected = selectedId === step?.id;
  const summary = stepSummary(step);

  // WhatsApp con botones: mostrar plantilla + botones y a dónde ramifica cada uno
  const cfg = step?.config ?? {};
  const waButtons: string[] = step?.type === "send_whatsapp"
    ? (cfg._buttons ?? [])
    : step?.type === "send_whatsapp_interactive"
      ? (cfg.buttons ?? []).filter((b: string) => b && b.trim())
      : [];
  const branchesOn = !!cfg.branches?.enabled;
  const cases: any[] = cfg.branches?.cases ?? [];
  const destLabel = (idx: any) => {
    const i = Number(idx);
    if (isNaN(i) || !steps?.[i]) return null;
    return `${i + 1}. ${STEP_META[steps[i].type]?.label ?? steps[i].type}`;
  };

  return (
    <div
      className="cursor-grab active:cursor-grabbing rounded-xl border-2 bg-white shadow-md transition-all hover:shadow-lg group"
      style={{
        width: NODE_W,
        borderColor: isSelected ? meta.color : meta.border,
        boxShadow: isSelected ? `0 0 0 3px ${meta.ring}` : undefined,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white" />

      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: meta.bg, color: meta.color }}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 leading-tight">{meta.label}</p>
          {summary && <p className="text-xs text-slate-500 truncate mt-0.5">{summary}</p>}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDeleteStep(step.id); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-50 hover:text-red-500 text-slate-400 cursor-pointer nodrag"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {waButtons.length > 0 && (
        <div className="border-t px-3 py-2 space-y-2">
          {cfg._body && <p className="text-[11px] text-slate-500 line-clamp-2 leading-snug">{cfg._body}</p>}
          {/* Botones lado a lado */}
          <div className="flex gap-1.5">
            {waButtons.map((b, i) => {
              const dest = branchesOn ? destLabel((cases.find((x: any) => x.match === b) || {}).next_index) : null;
              return (
                <div key={i} className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className="truncate text-center rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-1 text-[10px] font-medium text-emerald-700" title={b}>{b}</span>
                  {branchesOn && (
                    dest ? (
                      <button
                        onClick={e => { e.stopPropagation(); onAddBranchStep(step.id, b); }}
                        className="truncate text-center text-[9px] text-slate-500 hover:text-emerald-600 hover:underline nodrag"
                        title="Cambiar la acción de este botón"
                      >↓ {dest} ✎</button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); onAddBranchStep(step.id, b); }}
                        className="flex items-center justify-center gap-0.5 rounded-md bg-emerald-500 px-1 py-1 text-[9px] font-semibold text-white hover:bg-emerald-600 nodrag"
                        title="Agregar la acción que se ejecuta si tocan este botón"
                      >
                        <Plus className="h-2.5 w-2.5" /> acción
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
          {!branchesOn && (
            <button
              onClick={e => { e.stopPropagation(); onSelectNode(step.id); }}
              className="w-full text-[10px] text-emerald-600 hover:underline nodrag pt-0.5"
            >
              ⚡ Activar ramas por botón
            </button>
          )}
        </div>
      )}

      {/* Salidas: un conector por botón alineado debajo de cada uno. Otra/sin
          respuesta solo se muestran cuando tienen destino (evita puntos vacíos). */}
      {branchesOn ? (
        <>
          {waButtons.map((_, i) => (
            <Handle key={i} type="source" id={`br-btn-${i}`} position={Position.Bottom}
              style={{ left: `${((i + 0.5) / waButtons.length) * 100}%` }}
              className="!bg-emerald-500 !w-2.5 !h-2.5 !border-2 !border-white" />
          ))}
          {(cfg.branches?.default_next_index != null) && (
            <Handle type="source" id="br-default" position={Position.Bottom} style={{ left: "38%" }} className="!bg-slate-400 !w-2 !h-2 !border !border-white" />
          )}
          {(cfg.branches?.no_reply_next_index != null) && (
            <Handle type="source" id="br-noreply" position={Position.Bottom} style={{ left: "62%" }} className="!bg-slate-400 !w-2 !h-2 !border !border-white" />
          )}
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white" />
      )}

      {/* "+ paso" para continuar la rama desde este nodo (útil en ramas que
          terminan sin siguiente paso). No aparece en el mensaje con ramas
          activas (ese usa el "+ acción" por botón). */}
      {!branchesOn && (
        <button
          onClick={e => { e.stopPropagation(); const idx = steps.findIndex(s => s.id === step.id); onInsertStep(idx + 1); }}
          className="nodrag absolute left-1/2 -bottom-3 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-400 shadow hover:border-indigo-500 hover:text-indigo-600 z-10"
          title="Agregar un paso después de este"
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ── Custom: End node ──────────────────────────────────────────────────────────
function EndNode(_: NodeProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-white" style={{ width: NODE_W, height: 48 }}>
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white" />
      <span className="text-xs text-slate-400 font-medium">{t("automationsPage.flowEnd")}</span>
    </div>
  );
}

// ── Custom: Addable edge (with "+" button) ────────────────────────────────────
// NOTE: EdgeLabelRenderer renders via a portal outside the FlowCtx tree, and
// React Flow's internal edge state strips function references from edge.data.
// We therefore read the callback from the module-level _onInsertStep ref,
// which AutomationBuilder keeps up-to-date on every render.
function AddableEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps) {
  const { t } = useTranslation();
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY });
  const insertIndex: number = (data as EdgeNodeData)?.insertIndex ?? 0;

  return (
    <>
      <BaseEdge path={edgePath} style={{ stroke: "#cbd5e1", strokeWidth: 2 }} />
      <EdgeLabelRenderer>
        <div
          className="absolute nodrag nopan"
          style={{
            transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
            zIndex: 5,
            pointerEvents: "all",
          }}
        >
          <button
            onClick={e => { e.stopPropagation(); _onInsertStep?.(insertIndex); }}
            className="group flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-400 shadow transition-all hover:border-indigo-500 hover:text-indigo-600 hover:scale-110 hover:shadow-md"
            title={t("automationsPage.addStepHere")}
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// Edge de rama (desde un botón hacia su acción). Etiquetado y coloreado.
function BranchEdge({ sourceX, sourceY, targetX, targetY, data, style }: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY });
  const label = (data as any)?.label as string | undefined;
  return (
    <>
      <BaseEdge path={edgePath} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div className="absolute nodrag nopan" style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, zIndex: 6, pointerEvents: "none" }}>
            <span className="rounded-full border bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm max-w-[130px] truncate inline-block">{label}</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { triggerNode: TriggerNode, stepNode: StepNode, endNode: EndNode };
const edgeTypes = { addableEdge: AddableEdge, branchEdge: BranchEdge };

// ── Step type picker dialog ───────────────────────────────────────────────────
function StepPicker({ open, onClose, onSelect }: {
  open: boolean; onClose: () => void;
  onSelect: (type: AutomationStep["type"]) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const filteredGroups = STEP_GROUPS.map(group => ({
    ...group,
    types: group.types.filter(st => {
      const meta = STEP_META[st];
      return !query || meta.label.toLowerCase().includes(query.toLowerCase())
        || meta.description.toLowerCase().includes(query.toLowerCase());
    }),
  })).filter(g => g.types.length > 0);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setQuery(""); } }}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold">{t("automationsPage.addStep")}</span>
          <button onClick={() => { onClose(); setQuery(""); }} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t("automationsPage.searchActionPlaceholder")}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Groups + items */}
        <div className="overflow-y-auto max-h-[400px] py-1">
          {filteredGroups.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">{t("automationsPage.noResultsFor", { query })}</p>
          )}
          {filteredGroups.map(group => (
            <div key={group.label}>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {group.label}
              </p>
              {group.types.map(type => {
                const meta = STEP_META[type];
                const Icon = meta.icon;
                return (
                  <button
                    key={type}
                    onClick={() => { onSelect(type as AutomationStep["type"]); onClose(); setQuery(""); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 group"
                  >
                    {/* Icon chip — small, subtle */}
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                      style={{ background: meta.bg, borderColor: meta.border, color: meta.color }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight">{meta.label}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5 leading-tight">{meta.description}</p>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40 -rotate-90 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Scheduled trigger helpers ─────────────────────────────────────────────────
const CRON_PRESETS = [
  { label: "Cada día a las 9:00 am",          value: "0 9 * * *" },
  { label: "Cada lunes a las 9:00 am",         value: "0 9 * * 1" },
  { label: "El 1° de cada mes a las 9:00 am",  value: "0 9 1 * *" },
  { label: "Días hábiles a las 9:00 am",       value: "0 9 * * 1-5" },
  { label: "Cada 6 horas",                     value: "0 */6 * * *" },
  { label: "Cada 30 minutos",                  value: "*/30 * * * *" },
  { label: "Personalizado",                    value: "__custom__" },
];

function describeCron(expr: string): string {
  if (!expr?.trim()) return "";
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return "⚠ Necesita exactamente 5 campos separados por espacio";
  const [min, hour, dom, , dow] = parts;
  const DOW_ES: Record<string, string> = {
    "0": "domingos", "1": "lunes", "2": "martes", "3": "miércoles",
    "4": "jueves", "5": "viernes", "6": "sábados", "1-5": "días hábiles (lun–vie)",
  };
  if (min.startsWith("*/") && hour === "*" && dom === "*" && dow === "*")
    return `↻ Cada ${min.slice(2)} minutos`;
  if (min === "0" && hour.startsWith("*/") && dom === "*" && dow === "*")
    return `↻ Cada ${hour.slice(2)} horas`;
  const hourNum = parseInt(hour);
  const hourStr = isNaN(hourNum) ? hour : `${hourNum}:00`;
  if (min === "0" && !isNaN(hourNum) && dom === "*" && dow === "*")
    return `↻ Todos los días a las ${hourStr}`;
  if (min === "0" && !isNaN(hourNum) && dom === "*" && dow !== "*")
    return `↻ Cada ${DOW_ES[dow] ?? `día (${dow})`} a las ${hourStr}`;
  if (min === "0" && !isNaN(hourNum) && dom !== "*" && dom !== "*/1" && dow === "*")
    return `↻ El día ${dom} de cada mes a las ${hourStr}`;
  return `Expresión cron: ${expr}`;
}

// Pipeline + stage selector for the "stage changed" trigger (stores stage_id so
// the runner matches reliably). Empty = any stage.
function StageTriggerPicker({ config, onChange }: { config: Record<string, any>; onChange: (cfg: Record<string, any>) => void }) {
  const { t } = useTranslation();
  const { organizationId } = useOrganizationContext();
  const [pipelines, setPipelines] = React.useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = React.useState<{ id: string; name: string; pipeline_id: string }[]>([]);
  React.useEffect(() => {
    if (!organizationId) return;
    supabase.from("pipelines").select("id, name").eq("organization_id", organizationId).order("created_at").then(({ data }) => setPipelines(data || []));
    supabase.from("pipeline_stages").select("id, name, pipeline_id").eq("organization_id", organizationId).order("order", { ascending: true }).then(({ data }) => setStages((data as any) || []));
  }, [organizationId]);
  const pid: string = config?.pipeline_id ?? "";
  const stagesFor = pid ? stages.filter(s => s.pipeline_id === pid) : stages;
  const pname = (id: string) => pipelines.find(p => p.id === id)?.name ?? "";
  return (
    <div className="space-y-2">
      <Label>{t("automationsPage.triggerStageOptional")}</Label>
      {pipelines.length > 1 && (
        <Select value={pid || "all"} onValueChange={v => onChange({ ...config, pipeline_id: v === "all" ? "" : v, stage_id: "", stage_name: "" })}>
          <SelectTrigger className="mt-1"><SelectValue placeholder={t("automationsPage.allPipelines")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("automationsPage.allPipelines")}</SelectItem>
            {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <Select value={config?.stage_id || "all"} onValueChange={v => {
        if (v === "all") { onChange({ ...config, stage_id: "", stage_name: "" }); return; }
        const st = stages.find(s => s.id === v);
        onChange({ ...config, stage_id: v, stage_name: st?.name ?? "", pipeline_id: st?.pipeline_id ?? config?.pipeline_id ?? "" });
      }}>
        <SelectTrigger className="mt-1"><SelectValue placeholder={t("automationsPage.anyStage")} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("automationsPage.anyStage")}</SelectItem>
          {stagesFor.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{pipelines.length > 1 ? ` · ${pname(s.pipeline_id)}` : ""}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t("automationsPage.stageTriggerHint")}</p>
    </div>
  );
}

function ScheduledTriggerEditor({
  triggerConfig, onChange,
}: { triggerConfig: Record<string, any>; onChange: (cfg: Record<string, any>) => void }) {
  const { t } = useTranslation();
  const cronExpr: string = triggerConfig?.cron_expression ?? "";
  const knownPreset = CRON_PRESETS.find(p => p.value === cronExpr && p.value !== "__custom__");
  const [presetKey, setPresetKey] = React.useState<string>(knownPreset?.value ?? (cronExpr ? "__custom__" : "0 9 * * *"));
  const [custom, setCustom] = React.useState(cronExpr || "0 9 * * *");

  // Sync on external changes (e.g. opening editor with saved value)
  React.useEffect(() => {
    const saved = triggerConfig?.cron_expression ?? "";
    const known = CRON_PRESETS.find(p => p.value === saved && p.value !== "__custom__");
    if (known) { setPresetKey(known.value); }
    else if (saved) { setPresetKey("__custom__"); setCustom(saved); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePreset = (val: string) => {
    setPresetKey(val);
    if (val !== "__custom__") onChange({ ...triggerConfig, cron_expression: val });
  };

  const handleCustom = (val: string) => {
    setCustom(val);
    onChange({ ...triggerConfig, cron_expression: val });
  };

  const activeExpr = presetKey === "__custom__" ? custom : presetKey;
  const description = describeCron(activeExpr);
  const isValid = activeExpr.trim().split(/\s+/).length === 5;

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-amber-500" />
          {t("automationsPage.triggerFrequency")}
        </Label>
        <Select value={presetKey} onValueChange={handlePreset}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CRON_PRESETS.map(p => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {presetKey === "__custom__" && (
        <div>
          <Label className="text-xs">{t("automationsPage.customCronExpression")}</Label>
          <Input
            className="mt-1 font-mono text-sm"
            value={custom}
            onChange={e => handleCustom(e.target.value)}
            placeholder="0 9 * * 1"
          />
          <p className="text-xs text-muted-foreground mt-1">{t("automationsPage.cronFormatHint")}</p>
        </div>
      )}

      {activeExpr && (
        <div className={`rounded-lg border p-3 text-xs space-y-0.5 ${isValid ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          <p className="font-medium">{isValid ? description : description}</p>
          {isValid && (
            <p className="text-amber-600/80">
              {t("automationsPage.cronRunnerInfoPre")}{" "}
              <strong>{t("automationsPage.cronRunnerInfoBold")}</strong>{" "}
              {t("automationsPage.cronRunnerInfoPost")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Trigger config editor (with Meta lead form picker) ────────────────────────
function TriggerConfigEditor({
  triggerType, triggerConfig, onChange,
}: {
  triggerType: string;
  triggerConfig: Record<string, any>;
  onChange: (type: string, config: Record<string, any>) => void;
}) {
  const { t } = useTranslation();
  const { organizationId } = useOrganizationContext();
  const [metaForms, setMetaForms] = useState<{ form_id: string; form_name: string; page_id: string }[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [landingPages, setLandingPages] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [loadingLandings, setLoadingLandings] = useState(false);
  const [emailCampaigns, setEmailCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [dateFields, setDateFields] = useState<{ value: string; label: string }[]>([
    { value: "birthday", label: t("automationsPage.fieldBirthday") },
    { value: "expected_close_date", label: t("automationsPage.fieldExpectedCloseDate") },
  ]);
  useEffect(() => {
    if (triggerType !== "contact_date" || !organizationId) return;
    supabase.from("custom_field_definitions").select("key, label, field_type")
      .eq("organization_id", organizationId)
      .ilike("field_type", "%date%")
      .then(({ data }) => {
        if (data?.length) setDateFields(prev => {
          const base = prev.filter(p => !p.value.startsWith("custom:"));
          return [...base, ...data.map((f: any) => ({ value: `custom:${f.key}`, label: f.label }))];
        });
      });
  }, [triggerType, organizationId]);

  // Load Meta forms from DB when trigger type is meta_lead_form (org-scoped —
  // multi-org users must not see other workspaces' forms)
  useEffect(() => {
    if (triggerType !== "meta_lead_form" || !organizationId) return;
    setLoadingForms(true);
    supabase
      .from("facebook_lead_forms")
      .select("form_id, form_name, page_id")
      .eq("organization_id", organizationId)
      .order("form_name", { ascending: true })
      .then(({ data }) => {
        setMetaForms(data || []);
        setLoadingForms(false);
      });
  }, [triggerType, organizationId]);

  // Load landing pages when trigger type is landing_form_submitted
  useEffect(() => {
    if (triggerType !== "landing_form_submitted") return;
    if (!organizationId) return;
    setLoadingLandings(true);
    supabase
      .from("landing_pages")
      .select("id, name, slug")
      .eq("status", "published")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true })
      .then(({ data }) => {
        setLandingPages(data || []);
        setLoadingLandings(false);
      });
  }, [triggerType, organizationId]);

  // Load email campaigns when trigger is email_opened / email_clicked
  // (org-scoped — other workspaces' campaigns must never appear here)
  useEffect(() => {
    if ((triggerType !== "email_opened" && triggerType !== "email_clicked") || !organizationId) return;
    setLoadingCampaigns(true);
    supabase
      .from("email_campaigns")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setEmailCampaigns(data || []);
        setLoadingCampaigns(false);
      });
  }, [triggerType, organizationId]);

  return (
    <div className="space-y-4">
      <div>
        <Label>{t("automationsPage.triggerType")}</Label>
        <Select value={triggerType} onValueChange={v => onChange(v, {})}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Meta Lead Form picker ── */}
      {triggerType === "meta_lead_form" && (
        <div className="space-y-3">
          <div>
            <Label className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-blue-500" />
              {t("automationsPage.metaForm")}
            </Label>
            {loadingForms ? (
              <p className="text-xs text-muted-foreground mt-2">{t("automationsPage.loadingForms")}</p>
            ) : metaForms.length === 0 ? (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 space-y-1">
                <p className="font-medium">{t("automationsPage.noSyncedForms")}</p>
                <p>{t("automationsPage.noSyncedFormsHintPre")}<strong>{t("automationsPage.metaLeadAdsPath")}</strong>{t("automationsPage.noSyncedFormsHintPost")}</p>
              </div>
            ) : (
              <Select
                value={triggerConfig?.form_id ?? ""}
                onValueChange={formId => {
                  const form = metaForms.find(f => f.form_id === formId);
                  onChange(triggerType, {
                    ...triggerConfig,
                    form_id: formId,
                    form_name: form?.form_name ?? "",
                    page_id: form?.page_id ?? "",
                  });
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t("automationsPage.selectFormPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {metaForms.map(f => (
                    <SelectItem key={f.form_id} value={f.form_id}>
                      <span className="font-medium">{f.form_name}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{f.form_id}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {triggerConfig?.form_id && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700 space-y-0.5">
              <p className="font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("automationsPage.configuredCorrectly")}
              </p>
              <p>{t("automationsPage.metaFormConfiguredPre")}<strong>"{triggerConfig.form_name}"</strong>{t("automationsPage.metaFormConfiguredPost")}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Landing Page trigger ── */}
      {triggerType === "landing_form_submitted" && (
        <div className="space-y-3">
          <div>
            <Label className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-indigo-500" />
              {t("automationsPage.landingPage")}
            </Label>
            {loadingLandings ? (
              <p className="text-xs text-muted-foreground mt-2">{t("automationsPage.loadingLandings")}</p>
            ) : landingPages.length === 0 ? (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 space-y-1">
                <p className="font-medium">{t("automationsPage.noPublishedLandings")}</p>
                <p>{t("automationsPage.noPublishedLandingsHintPre")}<strong>{t("automationsPage.marketingLandingsPath")}</strong>{t("automationsPage.noPublishedLandingsHintPost")}</p>
              </div>
            ) : (
              <>
                <Select
                  value={triggerConfig?.page_id ?? "all"}
                  onValueChange={v => {
                    if (v === "all") {
                      onChange(triggerType, { ...triggerConfig, page_id: "", page_name: "" });
                    } else {
                      const page = landingPages.find(p => p.id === v);
                      onChange(triggerType, { ...triggerConfig, page_id: v, page_name: page?.name ?? "" });
                    }
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={t("automationsPage.anyLandingPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("automationsPage.anyLandingPage")}</SelectItem>
                    {landingPages.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="font-medium">{p.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">/{p.slug}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("automationsPage.anyLandingHint")}
                </p>
              </>
            )}
          </div>
          {(triggerConfig?.page_id || landingPages.length > 0) && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700 space-y-0.5">
              <p className="font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("automationsPage.ready")}
              </p>
              <p>
                {triggerConfig?.page_id
                  ? <>{t("automationsPage.landingConfiguredSpecificPre")}<strong>"{triggerConfig.page_name}"</strong>{t("automationsPage.landingConfiguredSpecificPost")}</>
                  : <>{t("automationsPage.landingConfiguredAnyPre")}<strong>{t("automationsPage.landingConfiguredAnyBold")}</strong>{t("automationsPage.landingConfiguredAnyPost")}</>
                }
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Email opened / clicked trigger ── */}
      {(triggerType === "email_opened" || triggerType === "email_clicked") && (
        <div className="space-y-3">
          <div>
            <Label className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-blue-500" />
              {t("automationsPage.emailCampaign")}
            </Label>
            {loadingCampaigns ? (
              <p className="text-xs text-muted-foreground mt-2">{t("automationsPage.loadingCampaigns")}</p>
            ) : (
              <>
                <Select
                  value={triggerConfig?.campaign_id ?? "all"}
                  onValueChange={v => {
                    if (v === "all") {
                      onChange(triggerType, { ...triggerConfig, campaign_id: "", campaign_name: "" });
                    } else {
                      const camp = emailCampaigns.find(c => c.id === v);
                      onChange(triggerType, { ...triggerConfig, campaign_id: v, campaign_name: camp?.name ?? "" });
                    }
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={t("automationsPage.anyCampaignPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("automationsPage.anyCampaign")}</SelectItem>
                    {emailCampaigns.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("automationsPage.filterByCampaignHint")}
                </p>
              </>
            )}
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 space-y-0.5">
            <p className="font-medium flex items-center gap-1">
              <Info className="h-3.5 w-3.5" />
              {t("automationsPage.firesOncePerContact")}
            </p>
            <p>
              {triggerType === "email_opened"
                ? t("automationsPage.firesOnFirstOpen")
                : t("automationsPage.firesOnFirstClick")
              }
            </p>
          </div>
        </div>
      )}

      {/* ── Other trigger configs ── */}
      {triggerType === "tag_added" && (
        <div>
          <Label>{t("automationsPage.triggerTag")}</Label>
          <TagPicker
            value={triggerConfig?.tag ?? ""}
            onChange={v => onChange(triggerType, { ...triggerConfig, tag: v })}
            placeholder={t("automationsPage.chooseOrCreateTag")}
          />
        </div>
      )}
      {triggerType === "contact_stage_changed" && (
        <StageTriggerPicker config={triggerConfig} onChange={cfg => onChange(triggerType, cfg)} />
      )}
      {triggerType === "contact_created" && (
        <div>
          <Label>{t("automationsPage.contactSource")}</Label>
          <Select value={triggerConfig?.source ?? "any"} onValueChange={v => onChange("contact_created", { ...triggerConfig, source: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t("automationsPage.anySource")}</SelectItem>
              <SelectItem value="api">{t("automationsPage.sourceApi")}</SelectItem>
              <SelectItem value="whatsapp">{t("automationsPage.sourceWhatsappIncoming")}</SelectItem>
              <SelectItem value="meta_lead_form">{t("automationsPage.sourceMetaLeadForm")}</SelectItem>
              <SelectItem value="landing">{t("automationsPage.sourceLanding")}</SelectItem>
              <SelectItem value="embed_form">{t("automationsPage.sourceEmbedForm")}</SelectItem>
              <SelectItem value="manual">{t("automationsPage.sourceManual")}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            {t("automationsPage.contactSourceHint")}
          </p>
        </div>
      )}

      {triggerType === "whatsapp_incoming" && (
        <div>
          <Label>Con qué frecuencia disparar</Label>
          <Select value={triggerConfig?.frequency ?? "every"} onValueChange={v => onChange("whatsapp_incoming", { ...triggerConfig, frequency: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="once">Solo la primera vez por contacto (recomendado para bots)</SelectItem>
              <SelectItem value="daily">Máximo una vez al día por contacto</SelectItem>
              <SelectItem value="every">Cada mensaje entrante</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            Para bots elige "Solo la primera vez" — así el flujo no se reinicia con cada mensaje del mismo contacto; la conversación fluye por las ramas. Usa "Cada mensaje" solo para auto-respuestas que deban repetirse siempre.
          </p>
        </div>
      )}

      {triggerType === "scheduled" && (
        <ScheduledTriggerEditor triggerConfig={triggerConfig} onChange={cfg => onChange("scheduled", cfg)} />
      )}

      {triggerType === "contact_date" && (
        <div className="space-y-3">
          <div>
            <Label className="flex items-center gap-1.5"><Cake className="h-3.5 w-3.5 text-pink-500" /> {t("automationsPage.dateField")}</Label>
            <Select value={triggerConfig?.date_field ?? ""} onValueChange={v => onChange("contact_date", { ...triggerConfig, date_field: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder={t("automationsPage.selectFieldPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {dateFields.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("automationsPage.whenToTrigger")}</Label>
            <div className="flex gap-2 mt-1 items-center">
              <Input type="number" min={0} className="w-20"
                value={triggerConfig?.offset_value ?? 0}
                onChange={e => onChange("contact_date", { ...triggerConfig, offset_value: Number(e.target.value) })} />
              <span className="text-sm text-muted-foreground">{t("automationsPage.days")}</span>
              <Select value={triggerConfig?.offset_dir ?? "on"} onValueChange={v => onChange("contact_date", { ...triggerConfig, offset_dir: v })}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="before">{t("automationsPage.before")}</SelectItem>
                  <SelectItem value="on">{t("automationsPage.sameDay")}</SelectItem>
                  <SelectItem value="after">{t("automationsPage.after")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{t("automationsPage.triggerHour")}</Label>
            <Input type="number" min={0} max={23} className="w-24 mt-1"
              value={triggerConfig?.send_hour ?? 9}
              onChange={e => onChange("contact_date", { ...triggerConfig, send_hour: Number(e.target.value) })} />
            <span className="text-xs text-muted-foreground ml-2">{t("automationsPage.localHourRange")}</span>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={triggerConfig?.annual ?? true}
              onChange={e => onChange("contact_date", { ...triggerConfig, annual: e.target.checked })} />
            {t("automationsPage.annualDate")}
          </label>
          <div className="rounded-lg border border-pink-200 bg-pink-50 p-3 text-xs text-pink-700">
            {t("automationsPage.contactDateInfo")}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Multi-trigger editor: a flow can fire on ANY of several triggers (OR) ──────
function MultiTriggerEditor({
  triggers, onChange,
}: {
  triggers: { type: string; config: Record<string, any> }[];
  onChange: (triggers: { type: string; config: Record<string, any> }[]) => void;
}) {
  const { t } = useTranslation();
  const list = triggers.length ? triggers : [{ type: "manual", config: {} }];
  const update = (idx: number, type: string, config: Record<string, any>) =>
    onChange(list.map((x, i) => (i === idx ? { type, config } : x)));
  const remove = (idx: number) => {
    const next = list.filter((_, i) => i !== idx);
    onChange(next.length ? next : [{ type: "manual", config: {} }]);
  };
  const add = () => {
    const used = new Set(list.map(x => x.type));
    const avail = Object.keys(TRIGGER_LABELS).find(k => !used.has(k)) || "contact_created";
    onChange([...list, { type: avail, config: {} }]);
  };

  return (
    <div className="space-y-4">
      {list.length > 1 && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-700">
          {t("automationsPage.multiTriggerInfoPre")}<strong>{t("automationsPage.multiTriggerInfoBold")}</strong>{t("automationsPage.multiTriggerInfoPost")}
        </div>
      )}
      {list.map((trg, idx) => (
        <div key={idx}>
          {idx > 0 && (
            <div className="flex items-center gap-2 py-1.5">
              <span className="h-px flex-1 bg-border" />
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-500">{t("automationsPage.orLabel")}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          )}
          <div className="rounded-xl border p-3 space-y-3">
          {list.length > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                {t("automationsPage.triggerN", { n: idx + 1 })}
              </span>
              <button onClick={() => remove(idx)} className="text-muted-foreground hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <TriggerConfigEditor
            triggerType={trg.type}
            triggerConfig={trg.config}
            onChange={(type, config) => update(idx, type, config)}
          />
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full gap-2" onClick={add}>
        <Plus className="h-4 w-4" /> {t("automationsPage.addAnotherTrigger")}
      </Button>
    </div>
  );
}

// ── Node config panel ─────────────────────────────────────────────────────────
function NodeConfigPanel({
  selectedId, steps, triggers,
  onClose, onStepChange, onTriggersChange,
}: {
  selectedId: string;
  steps: AutomationStep[];
  triggers: { type: string; config: Record<string, any> }[];
  onClose: () => void;
  onStepChange: (step: AutomationStep) => void;
  onTriggersChange: (triggers: { type: string; config: Record<string, any> }[]) => void;
}) {
  const { t } = useTranslation();
  const step = steps.find(s => s.id === selectedId) || null;
  const isTrigger = selectedId === "trigger";

  return (
    <div className="flex h-full flex-col">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          {isTrigger
            ? <><Zap className="h-4 w-4 text-indigo-500" /><span className="text-sm font-semibold">{t("automationsPage.trigger")}</span></>
            : step
              ? (() => { const m = STEP_META[step.type]; const I = m.icon; return <><I className="h-4 w-4" style={{ color: m.color }} /><span className="text-sm font-semibold">{m.label}</span></>; })()
              : null
          }
        </div>
        <button onClick={onClose} className="rounded-md p-1 hover:bg-muted text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Panel body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isTrigger && (
          <MultiTriggerEditor triggers={triggers} onChange={onTriggersChange} />
        )}

        {step && <StepConfigEditor step={step} onChange={onStepChange} steps={steps} stepIndex={steps.findIndex(s => s.id === step.id)} />}
      </div>
    </div>
  );
}

// Campos del contacto disponibles para mapear variables
const CONTACT_FIELDS = [
  { value: "{{contact.first_name}}",   label: "Nombre" },
  { value: "{{contact.last_name}}",    label: "Apellido" },
  { value: "{{contact.full_name}}",    label: "Nombre completo" },
  { value: "{{contact.primary_email}}",label: "Email" },
  { value: "{{contact.primary_phone}}",label: "Teléfono" },
  { value: "{{contact.company_name}}", label: "Empresa" },
  { value: "{{contact.city}}",         label: "Ciudad" },
  { value: "{{contact.country}}",      label: "País" },
  { value: "{{contact.notes}}",        label: "Notas" },
  // Cita — disponibles cuando el disparador es "Cita agendada" / "Cita reagendada"
  { value: "{{meeting.fecha}}",        label: "Cita — Fecha" },
  { value: "{{meeting.hora}}",         label: "Cita — Hora" },
  { value: "{{meeting.fecha_hora}}",   label: "Cita — Fecha y hora" },
  { value: "{{meeting.lugar_o_link}}", label: "Cita — Lugar o link" },
  { value: "{{meeting.titulo}}",       label: "Cita — Título" },
  { value: "{{meeting.tipo}}",         label: "Cita — Tipo" },
];

/** Detecta cuántas variables {{N}} usa el body de la plantilla */
function countTemplateVars(bodyText: string): number {
  const matches = bodyText.match(/\{\{\d+\}\}/g) ?? [];
  const nums = matches.map(m => parseInt(m.replace(/\D/g, ""), 10));
  return nums.length > 0 ? Math.max(...nums) : 0;
}

/** Resalta las variables en el body con un span de color */
function HighlightedBody({ body, variables }: { body: string; variables: string[] }) {
  // Reemplaza {{N}} con el valor asignado o un placeholder coloreado
  const parts = body.split(/(\{\{\d+\}\})/g);
  return (
    <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
      {parts.map((part, i) => {
        const match = part.match(/^\{\{(\d+)\}\}$/);
        if (match) {
          const idx = parseInt(match[1], 10) - 1;
          const val = variables[idx];
          return (
            <span key={i} className={`inline-block px-1 rounded font-medium ${val ? "bg-indigo-100 text-indigo-700" : "bg-red-100 text-red-500"}`}>
              {val ? val.replace("{{contact.", "").replace("}}", "") : `{{${idx + 1}}}`}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

// ── WhatsApp template selector sub-component ──────────────────────────────────
function WhatsAppStepEditor({ step, onChange, steps = [], stepIndex = -1 }: {
  step: AutomationStep;
  onChange: (updated: AutomationStep) => void;
  steps?: AutomationStep[];
  stepIndex?: number;
}) {
  const { t } = useTranslation();
  const { organizationId } = useOrganizationContext();
  const c = step.config;
  const set = (key: string, val: any) => onChange({ ...step, config: { ...c, [key]: val } });

  const [templates, setTemplates] = useState<{ id: string; name: string; language: string; status: string; body_text: string; buttons?: any[] }[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(false);
  // Campos personalizados de la org → variables {{custom.<clave>}}
  const [customFieldVars, setCustomFieldVars] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (!organizationId) return;
    setLoadingTpl(true);
    supabase
      .from("whatsapp_templates")
      .select("id, name, language, status, body_text, buttons")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true })
      .then(({ data }) => { setTemplates(data || []); setLoadingTpl(false); });
    supabase
      .from("custom_field_definitions")
      .select("key, label")
      .eq("organization_id", organizationId)
      .order("position", { ascending: true })
      .then(({ data }) => {
        setCustomFieldVars((data ?? []).map((d: any) => ({ value: `{{custom.${d.key}}}`, label: `Campo — ${d.label}` })));
      });
  }, [organizationId]);

  const selectedTpl = templates.find(
    t => t.name === c.template_name && t.language === (c.language || t.language),
  );

  const varCount = selectedTpl ? countTemplateVars(selectedTpl.body_text) : 0;
  const variables: string[] = c.variables ?? [];

  const handleSelectTemplate = (value: string) => {
    const [name, language] = value.split("||");
    const tpl = templates.find(t => t.name === name && t.language === (language || t.language));
    const qr = (tpl?.buttons ?? []).filter((b: any) => { const ty = String(b?.type ?? "").toUpperCase(); return (ty === "QUICK_REPLY" || ty === "") && b.text; }).map((b: any) => b.text);
    // Resetear variables al cambiar de plantilla; guardar botones y cuerpo para
    // que el nodo del lienzo muestre la plantilla sin volver a consultar.
    onChange({ ...step, config: { ...c, template_name: name, language, variables: [], _buttons: qr, _body: tpl?.body_text ?? "" } });
  };

  const setVar = (idx: number, val: string) => {
    const next = [...variables];
    next[idx] = val;
    onChange({ ...step, config: { ...c, variables: next } });
  };

  const approvedTemplates = templates.filter(x => ["APPROVED", "approved"].includes(x.status));
  const displayTemplates = approvedTemplates.length > 0 ? approvedTemplates : templates;

  return (
    <div className="space-y-4">
      {/* ── Selector de plantilla ── */}
      <div>
        <Label className="text-xs font-semibold">{t("automationsPage.whatsappTemplate")}</Label>
        {loadingTpl ? (
          <p className="text-xs text-muted-foreground mt-1">{t("automationsPage.loadingTemplates")}</p>
        ) : displayTemplates.length === 0 ? (
          <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 space-y-1">
            <p className="font-medium">{t("automationsPage.noTemplatesAvailable")}</p>
            <p>{t("automationsPage.noWhatsappTemplatesHintPre")}<strong>{t("automationsPage.waTemplatesPath")}</strong>{t("automationsPage.noWhatsappTemplatesHintPost")}</p>
          </div>
        ) : (
          <Select
            value={c.template_name && c.language ? `${c.template_name}||${c.language}` : ""}
            onValueChange={handleSelectTemplate}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={t("automationsPage.selectTemplatePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {displayTemplates.map(tpl => (
                <SelectItem key={`${tpl.name}||${tpl.language}`} value={`${tpl.name}||${tpl.language}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{tpl.name}</span>
                    <span className="text-muted-foreground text-xs">{tpl.language}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      ["APPROVED", "approved"].includes(tpl.status)
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {tpl.status}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ── Vista previa con variables resaltadas ── */}
      {selectedTpl && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("automationsPage.preview")}</p>
          <HighlightedBody body={selectedTpl.body_text} variables={variables} />
          {Array.isArray(selectedTpl.buttons) && selectedTpl.buttons.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-slate-200">
              {selectedTpl.buttons.map((b: any, i: number) => (
                <span key={i} className="inline-flex items-center rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-xs text-emerald-700">
                  {b.text || b.title || b.url || "botón"}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {(() => {
        const qrButtons = (selectedTpl?.buttons ?? []).filter((b: any) => {
          const ty = String(b?.type ?? "").toUpperCase();
          return (ty === "QUICK_REPLY" || ty === "") && b.text;
        });
        if (!qrButtons.length) return null;
        const br = c.branches || {};
        const setBr = (patch: any) => set("branches", { ...br, ...patch });
        const laterSteps = steps.map((st, idx) => ({ st, idx })).filter(({ idx }) => idx > stepIndex);
        const stepLabel = (st: AutomationStep, idx: number) => `${idx + 1}. ${STEP_META[st.type]?.label ?? st.type}${stepSummary(st) ? ` · ${stepSummary(st)}` : ""}`.slice(0, 55);
        const StepPicker = ({ value, onPick, placeholder }: { value: any; onPick: (v: number | null) => void; placeholder: string }) => (
          <Select value={value != null ? String(value) : ""} onValueChange={v => onPick(v === "__none__" ? null : parseInt(v))}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={placeholder} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-xs italic">continúa al siguiente paso</SelectItem>
              {laterSteps.map(({ st, idx }) => <SelectItem key={st.id} value={String(idx)} className="text-xs">{stepLabel(st, idx)}</SelectItem>)}
            </SelectContent>
          </Select>
        );
        return (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Ramas por botón</Label>
              <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                <input type="checkbox" checked={!!br.enabled} onChange={e => setBr({ enabled: e.target.checked })} />
                Activar
              </label>
            </div>
            {!br.enabled ? (
              <p className="text-[11px] text-muted-foreground">Actívalo para reaccionar según el botón que toque el contacto (enviar otro WhatsApp, email, llamada, mover etapa…). Añade los pasos de cada rama al flujo y elígelos abajo.</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Esperar respuesta hasta</span>
                  <Input type="number" min={1} className="h-7 w-16 text-xs" value={br.timeout_value ?? 24}
                    onChange={e => setBr({ timeout_value: parseInt(e.target.value) || 24 })} />
                  <Select value={br.timeout_unit ?? "hours"} onValueChange={v => setBr({ timeout_unit: v })}>
                    <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">minutos</SelectItem>
                      <SelectItem value="hours">horas</SelectItem>
                      <SelectItem value="days">días</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {qrButtons.map((b: any, i: number) => {
                  const cases = br.cases ?? [];
                  const cur = cases.find((x: any) => x.match === b.text);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="shrink-0 w-32 truncate rounded bg-white dark:bg-emerald-900/30 border px-2 py-1 text-[11px] font-medium" title={b.text}>▸ {b.text}</span>
                      <StepPicker value={cur?.next_index} placeholder="¿qué acción? →"
                        onPick={(v) => {
                          const others = (br.cases ?? []).filter((x: any) => x.match !== b.text);
                          setBr({ cases: v == null ? others : [...others, { match: b.text, next_index: v }] });
                        }} />
                    </div>
                  );
                })}
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-32 text-[11px] text-muted-foreground">Otra respuesta</span>
                  <StepPicker value={br.default_next_index} placeholder="continúa" onPick={(v) => setBr({ default_next_index: v })} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 w-32 text-[11px] text-muted-foreground">Sin respuesta</span>
                  <StepPicker value={br.no_reply_next_index} placeholder="continúa" onPick={(v) => setBr({ no_reply_next_index: v })} />
                </div>
                <p className="text-[10px] text-muted-foreground">Cierra cada rama con "Fin de rama" para que no siga con la otra.</p>
              </>
            )}
          </div>
        );
      })()}

      {/* ── Mapper de variables ── */}
      {selectedTpl && varCount > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold">{t("automationsPage.messageVariables")}</Label>
          <p className="text-xs text-muted-foreground -mt-1">
            {t("automationsPage.messageVariablesHint")}
          </p>
          {Array.from({ length: varCount }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="shrink-0 w-8 text-center text-xs font-bold bg-indigo-100 text-indigo-700 rounded py-1">
                {`{{${i + 1}}}`}
              </span>
              <Select
                value={variables[i] ?? ""}
                onValueChange={val => setVar(i, val)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={t("automationsPage.selectFieldPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_FIELDS.map(f => (
                    <SelectItem key={f.value} value={f.value} className="text-xs">
                      <span className="font-medium">{f.label}</span>
                      <span className="text-muted-foreground ml-2">{f.value}</span>
                    </SelectItem>
                  ))}
                  {customFieldVars.map(f => (
                    <SelectItem key={f.value} value={f.value} className="text-xs">
                      <span className="font-medium">{f.label}</span>
                      <span className="text-muted-foreground ml-2">{f.value}</span>
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__" className="text-xs italic">
                    {t("automationsPage.customText")}
                  </SelectItem>
                </SelectContent>
              </Select>
              {/* Si eligió texto personalizado, mostrar input libre */}
              {variables[i] === "__custom__" && (
                <Input
                  className="h-8 text-xs"
                  placeholder={t("automationsPage.writeTextPlaceholder")}
                  onChange={e => setVar(i, e.target.value || "__custom__")}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {selectedTpl && varCount === 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          {t("automationsPage.templateNoVariables")}
        </p>
      )}
    </div>
  );
}

// ── Assign owner step editor ──────────────────────────────────────────────────
function AssignOwnerStepEditor({ step, onChange }: {
  step: AutomationStep;
  onChange: (updated: AutomationStep) => void;
}) {
  const { t } = useTranslation();
  const { organizationId } = useOrganizationContext();
  const [profiles, setProfiles] = useState<{ user_id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let orgId = organizationId;

    const fetchMembers = async (oid: string) => {
      // Try RPC first (SECURITY DEFINER, reads auth.users for emails)
      const { data: rpcData, error: rpcErr } = await supabase.rpc("get_org_members", { p_org_id: oid });
      if (!rpcErr && rpcData && rpcData.length > 0) {
        setProfiles(rpcData.map(m => ({
          user_id: m.user_id,
          full_name: m.full_name || m.email || m.user_id,
        })));
        setLoading(false);
        return;
      }
      if (rpcErr) console.warn("get_org_members RPC error:", rpcErr.message);

      // Fallback: direct query using org-scoped RLS policies
      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id, profiles(first_name, last_name, email)")
        .eq("organization_id", oid);

      setProfiles((members || []).map((m) => {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
        return { user_id: m.user_id, full_name: name || p?.email || m.user_id };
      }));
      setLoading(false);
    };

    if (orgId) {
      fetchMembers(orgId);
      return;
    }

    // organizationId not yet in context — resolve from organization_members
    supabase
      .from("organization_members")
      .select("organization_id")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.organization_id) fetchMembers(data.organization_id);
        else setLoading(false);
      });
  }, [organizationId]);

  const c = step.config;
  const mode: "specific" | "round_robin" = c.mode ?? "specific";
  const ownerIds: string[] = c.owner_ids ?? [];
  const ownerNames: string[] = c.owner_names ?? [];

  const setMode = (m: string) =>
    onChange({ ...step, config: { ...c, mode: m, owner_id: "", owner_name: "", owner_ids: [], owner_names: [] } });

  const toggleRRMember = (userId: string, checked: boolean) => {
    const next = checked ? [...ownerIds, userId] : ownerIds.filter(id => id !== userId);
    const names = next.map(id => profiles.find(p => p.user_id === id)?.full_name ?? id);
    onChange({ ...step, config: { ...c, owner_ids: next, owner_names: names } });
  };

  return (
    <div className="space-y-3">
      {/* Mode selector */}
      <div>
        <Label className="text-xs font-semibold">{t("automationsPage.assignmentMode")}</Label>
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="specific">
              <div className="flex flex-col">
                <span className="font-medium">{t("automationsPage.specificRep")}</span>
                <span className="text-xs text-muted-foreground">{t("automationsPage.specificRepDesc")}</span>
              </div>
            </SelectItem>
            <SelectItem value="round_robin">
              <div className="flex flex-col">
                <span className="font-medium">{t("automationsPage.roundRobin")}</span>
                <span className="text-xs text-muted-foreground">{t("automationsPage.roundRobinDesc")}</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Specific mode */}
      {mode === "specific" && (
        <div>
          <Label className="text-xs">{t("automationsPage.salesRep")}</Label>
          <Select
            value={c.owner_id ?? ""}
            onValueChange={v => {
              const profile = profiles.find(p => p.user_id === v);
              onChange({ ...step, config: { ...c, owner_id: v, owner_name: profile?.full_name ?? "" } });
            }}
          >
            <SelectTrigger className="mt-1">
              {/* Show saved name while profiles load, avoiding raw UUID display */}
              {c.owner_name
                ? <span className="text-sm">{c.owner_name}</span>
                : <SelectValue placeholder={t("automationsPage.selectRepPlaceholder")} />}
            </SelectTrigger>
            <SelectContent>
              {loading
                ? <div className="px-3 py-2 text-xs text-muted-foreground">{t("automationsPage.loadingReps")}</div>
                : profiles.length === 0
                  ? <div className="px-3 py-2 text-xs text-muted-foreground">{t("automationsPage.noRepsInOrg")}</div>
                  : profiles.map(p => (
                      <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>
                    ))
              }
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1.5">{t("automationsPage.leadAlwaysAssignedHint")}</p>
        </div>
      )}

      {/* Round Robin mode */}
      {mode === "round_robin" && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold">{t("automationsPage.repsInRotation")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("automationsPage.roundRobinAssignHint")}
          </p>
          <div className="rounded-lg border divide-y">
            {loading && (
              <p className="px-3 py-2 text-xs text-muted-foreground">{t("automationsPage.loadingReps")}</p>
            )}
            {!loading && profiles.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">{t("automationsPage.noRepsInOrg")}</p>
            )}
            {profiles.map(p => (
              <label key={p.user_id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/40">
                <input
                  type="checkbox"
                  className="accent-primary h-3.5 w-3.5"
                  checked={ownerIds.includes(p.user_id)}
                  onChange={e => toggleRRMember(p.user_id, e.target.checked)}
                />
                <span className="text-sm">{p.full_name}</span>
              </label>
            ))}
          </div>
          {ownerIds.length === 0 && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <Info className="h-3.5 w-3.5 shrink-0" />
              {t("automationsPage.selectAtLeastOneRep")}
            </p>
          )}
          {ownerIds.length > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
              {t("automationsPage.rotationAmong", { count: ownerIds.length })}:&nbsp;
              <span className="font-medium">{ownerNames.join(", ")}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Move Pipeline Stage editor ────────────────────────────────────────────────
function MovePipelineStepEditor({ step, onChange }: {
  step: AutomationStep;
  onChange: (updated: AutomationStep) => void;
}) {
  const { t } = useTranslation();
  const { organizationId } = useOrganizationContext();
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const c = step.config;

  useEffect(() => {
    if (!organizationId) return;
    supabase.from("pipelines").select("id, name").eq("organization_id", organizationId).order("name").then(({ data }) => setPipelines(data || []));
  }, [organizationId]);

  useEffect(() => {
    if (!c.pipeline_id) return;
    supabase.from("pipeline_stages").select("id, name").eq("pipeline_id", c.pipeline_id).order("order", { ascending: true }).then(({ data }) => setStages(data || []));
  }, [c.pipeline_id]);

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">{t("automationsPage.pipeline")}</Label>
        <Select value={c.pipeline_id ?? ""} onValueChange={v => onChange({ ...step, config: { ...c, pipeline_id: v, stage_id: "", stage_name: "" } })}>
          <SelectTrigger className="mt-1"><SelectValue placeholder={t("automationsPage.selectPipelinePlaceholder")} /></SelectTrigger>
          <SelectContent>{pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {c.pipeline_id && (
        <div>
          <Label className="text-xs">{t("automationsPage.destinationStage")}</Label>
          <Select value={c.stage_id ?? ""} onValueChange={v => {
            const stage = stages.find(s => s.id === v);
            onChange({ ...step, config: { ...c, stage_id: v, stage_name: stage?.name ?? "" } });
          }}>
            <SelectTrigger className="mt-1"><SelectValue placeholder={t("automationsPage.selectStagePlaceholder")} /></SelectTrigger>
            <SelectContent>{stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">{t("automationsPage.movePipelineHint")}</p>
    </div>
  );
}

// ── Email step editor (with template picker) ──────────────────────────────────
function EmailStepEditor({ step, onChange }: {
  step: AutomationStep;
  onChange: (updated: AutomationStep) => void;
}) {
  const { t } = useTranslation();
  const { organizationId } = useOrganizationContext();
  const c = step.config;
  const set = (key: string, val: any) => onChange({ ...step, config: { ...c, [key]: val } });

  const [templates, setTemplates] = useState<{ id: string; name: string; subject: string; html: string }[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    setLoadingTpl(true);
    supabase
      .from("email_templates")
      .select("id, name, subject, html")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true })
      .then(({ data }) => { setTemplates(data || []); setLoadingTpl(false); });
  }, [organizationId]);

  const handleSelectTemplate = (templateId: string) => {
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;
    onChange({ ...step, config: {
      ...c,
      template_id: tpl.id,
      template_name: tpl.name,
      subject: tpl.subject || c.subject || "",
      html_content: tpl.html || c.html_content || "",
    }});
  };

  const detachTemplate = () => {
    onChange({ ...step, config: { ...c, template_id: "", template_name: "" } });
  };

  const hasTemplate = !!c.template_id;

  return (
    <div className="space-y-3">
      {/* ── Remitente ── */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">{t("automationsPage.senderName")}</Label>
          <Input value={c.from_name ?? ""} onChange={e => set("from_name", e.target.value)} placeholder={t("automationsPage.senderNamePlaceholder")} />
        </div>
        <div>
          <Label className="text-xs">{t("automationsPage.senderEmail")}</Label>
          <Input value={c.from_email ?? ""} onChange={e => set("from_email", e.target.value)} placeholder="hola@empresa.com" />
        </div>
      </div>

      {/* ── Asunto ── */}
      <div>
        <Label className="text-xs">{t("automationsPage.subject")}</Label>
        <Input
          value={c.subject ?? ""}
          onChange={e => set("subject", e.target.value)}
          placeholder="Hola {{contact.first_name}}"
        />
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {t("automationsPage.variablesLabel")} <code>{"{{contact.first_name}}"}</code> <code>{"{{contact.last_name}}"}</code>
        </p>
      </div>

      {/* ── Template picker / content ── */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 text-blue-500" />
          {t("automationsPage.emailContent")}
        </Label>

        {/* Template selected state */}
        {hasTemplate ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-blue-100">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span className="text-xs font-medium text-blue-800 truncate">{c.template_name}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setPreviewOpen(p => !p)}
                  className="text-xs text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded hover:bg-blue-100 transition-colors"
                >
                  {previewOpen ? t("automationsPage.hide") : t("automationsPage.preview")}
                </button>
                <button
                  onClick={detachTemplate}
                  className="text-xs text-slate-500 hover:text-red-500 px-2 py-0.5 rounded hover:bg-red-50 transition-colors"
                >
                  {t("automationsPage.change")}
                </button>
              </div>
            </div>
            {/* Preview iframe */}
            {previewOpen && c.html_content && (
              <iframe
                srcDoc={c.html_content}
                className="w-full border-0"
                style={{ height: 280, background: "#fff" }}
                sandbox="allow-same-origin"
                title={t("automationsPage.emailPreviewTitle")}
              />
            )}
            {!previewOpen && (
              <p className="text-xs text-blue-600 px-3 py-2">
                {t("automationsPage.clickPreviewHint")}
              </p>
            )}
          </div>
        ) : (
          /* No template — show picker + manual textarea */
          <>
            {loadingTpl ? (
              <p className="text-xs text-muted-foreground">{t("automationsPage.loadingTemplates")}</p>
            ) : templates.length > 0 ? (
              <Select value="" onValueChange={handleSelectTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder={t("automationsPage.useEmailBuilderTemplate")} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(tpl => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      <span className="font-medium">{tpl.name}</span>
                      {tpl.subject && <span className="text-muted-foreground ml-2 text-xs">— {tpl.subject}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                <p className="font-medium">{t("automationsPage.noTemplates")}</p>
                <p>{t("automationsPage.noEmailTemplatesHintPre")}<strong>{t("automationsPage.marketingEmailBuilderPath")}</strong>{t("automationsPage.noEmailTemplatesHintPost")}</p>
              </div>
            )}

            <div>
              <Label className="text-xs text-muted-foreground">{t("automationsPage.orWriteHtmlManually")}</Label>
              <Textarea
                className="mt-1 font-mono text-xs"
                value={c.html_content ?? ""}
                onChange={e => set("html_content", e.target.value)}
                rows={5}
                placeholder="<p>Hola {{contact.first_name}},</p>"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Update contact step editor ────────────────────────────────────────────────
const UPDATE_CONTACT_FIELDS: {
  group: string;
  fields: { value: string; label: string; type: "text" | "textarea" | "number" | "date" | "select"; options?: { value: string; label: string }[] }[]
}[] = [
  {
    group: "Estado del lead",
    fields: [
      { value: "lead_status", label: "Estado del lead", type: "select", options: [
        { value: "nuevo", label: "Nuevo" },
        { value: "contactado", label: "Contactado" },
        { value: "calificado", label: "Calificado" },
        { value: "propuesta_enviada", label: "Propuesta enviada" },
        { value: "negociando", label: "Negociando" },
        { value: "ganado", label: "Ganado" },
        { value: "perdido", label: "Perdido" },
      ]},
      { value: "lost_reason", label: "Razón de pérdida", type: "text" },
      { value: "score", label: "Puntuación (score)", type: "number" },
      { value: "budget", label: "Presupuesto", type: "number" },
      { value: "budget_currency", label: "Moneda", type: "select", options: [
        { value: "USD", label: "USD — Dólar" },
        { value: "EUR", label: "EUR — Euro" },
        { value: "COP", label: "COP — Peso colombiano" },
        { value: "MXN", label: "MXN — Peso mexicano" },
        { value: "ARS", label: "ARS — Peso argentino" },
        { value: "CLP", label: "CLP — Peso chileno" },
        { value: "BRL", label: "BRL — Real brasileño" },
      ]},
      { value: "expected_close_date", label: "Fecha de cierre esperada", type: "date" },
    ],
  },
  {
    group: "Datos del contacto",
    fields: [
      { value: "notes", label: "Notas", type: "textarea" },
      { value: "preferred_channel", label: "Canal preferido", type: "select", options: [
        { value: "whatsapp", label: "WhatsApp" },
        { value: "email", label: "Email" },
        { value: "phone", label: "Teléfono" },
        { value: "instagram", label: "Instagram" },
      ]},
      { value: "language", label: "Idioma", type: "select", options: [
        { value: "es", label: "Español" },
        { value: "en", label: "English" },
        { value: "pt", label: "Português" },
        { value: "fr", label: "Français" },
      ]},
      { value: "city", label: "Ciudad", type: "text" },
      { value: "country", label: "País", type: "text" },
    ],
  },
  {
    group: "Atribución",
    fields: [
      { value: "source", label: "Fuente", type: "select", options: [
        { value: "organic", label: "Orgánico" },
        { value: "paid_meta", label: "Meta Ads" },
        { value: "paid_google", label: "Google Ads" },
        { value: "referral", label: "Referido" },
        { value: "whatsapp", label: "WhatsApp" },
        { value: "instagram", label: "Instagram" },
        { value: "email", label: "Email" },
        { value: "website", label: "Web" },
        { value: "other", label: "Otro" },
      ]},
      { value: "campaign", label: "Campaña", type: "text" },
    ],
  },
];

function UpdateContactEditor({ step, onChange }: {
  step: AutomationStep;
  onChange: (updated: AutomationStep) => void;
}) {
  const { t } = useTranslation();
  const c = step.config;
  const set = (key: string, val: any) => onChange({ ...step, config: { ...c, [key]: val } });

  // Flatten to find the selected field definition
  const allFields = UPDATE_CONTACT_FIELDS.flatMap(g => g.fields);
  const fieldDef = allFields.find(f => f.value === c.field);

  return (
    <div className="space-y-3">
      {/* Field selector */}
      <div>
        <Label className="text-xs font-semibold">{t("automationsPage.fieldToUpdate")}</Label>
        <Select value={c.field ?? ""} onValueChange={v => set("field", v)}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={t("automationsPage.selectFieldPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {UPDATE_CONTACT_FIELDS.map(group => (
              <React.Fragment key={group.group}>
                <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.group}
                </div>
                {group.fields.map(f => (
                  <SelectItem key={f.value} value={f.value} className="pl-4">
                    {f.label}
                  </SelectItem>
                ))}
              </React.Fragment>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Value input — adapts to field type */}
      {fieldDef && (
        <div>
          <Label className="text-xs font-semibold">{t("automationsPage.newValue")}</Label>
          {fieldDef.type === "select" && (
            <Select value={c.value ?? ""} onValueChange={v => set("value", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder={t("automationsPage.selectPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {fieldDef.options!.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {fieldDef.type === "text" && (
            <Input className="mt-1" value={c.value ?? ""} onChange={e => set("value", e.target.value)}
              placeholder={t("automationsPage.newFieldPlaceholder", { field: fieldDef.label.toLowerCase() })} />
          )}
          {fieldDef.type === "number" && (
            <Input type="number" className="mt-1" value={c.value ?? ""} onChange={e => set("value", e.target.value)}
              placeholder="0" />
          )}
          {fieldDef.type === "date" && (
            <Input type="date" className="mt-1" value={c.value ?? ""} onChange={e => set("value", e.target.value)} />
          )}
          {fieldDef.type === "textarea" && (
            <>
              <Textarea className="mt-1" rows={3} value={c.value ?? ""} onChange={e => set("value", e.target.value)}
                placeholder={t("automationsPage.writeFieldPlaceholder", { field: fieldDef.label.toLowerCase() })} />
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("automationsPage.variablesLabel")} <code>{"{{contact.first_name}}"}</code> <code>{"{{contact.last_name}}"}</code>
              </p>
            </>
          )}
        </div>
      )}

      {!c.field && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="h-3.5 w-3.5 shrink-0" />
          {t("automationsPage.selectFieldToConfigure")}
        </p>
      )}
    </div>
  );
}

// ── Make Call step editor ─────────────────────────────────────────────────────
function MakeCallStepEditor({ step, onChange }: {
  step: AutomationStep;
  onChange: (updated: AutomationStep) => void;
}) {
  const { t } = useTranslation();
  const c = step.config;
  const set = (key: string, val: any) => onChange({ ...step, config: { ...c, [key]: val } });
  const { organizationId } = useOrganizationContext();

  const [agents, setAgents] = useState<{ id: string; name: string; voice: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    supabase
      .from("calling_agents")
      .select("id, name, voice")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => { setAgents(data || []); setLoading(false); });
  }, [organizationId]);

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          <PhoneCall className="h-3.5 w-3.5 text-teal-600" />
          {t("automationsPage.aiCallingAgent")}
        </Label>
        {loading ? (
          <p className="text-xs text-muted-foreground mt-2">{t("automationsPage.loadingAgents")}</p>
        ) : agents.length === 0 ? (
          <div className="mt-2 rounded-lg border border-dashed border-teal-200 bg-teal-50 p-3">
            <p className="text-xs text-teal-700 font-medium">{t("automationsPage.noAgentsConfigured")}</p>
            <p className="text-xs text-teal-600 mt-0.5">
              {t("automationsPage.createAgentHintPre")}{" "}
              <a href="/calling-agent" className="underline hover:text-teal-800" target="_blank" rel="noreferrer">
                {t("automationsPage.callingAgentLink")}
              </a>{" "}
              {t("automationsPage.createAgentHintPost")}
            </p>
          </div>
        ) : (
          <Select value={c.calling_agent_id ?? ""} onValueChange={v => set("calling_agent_id", v)}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={t("automationsPage.selectAgentPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {agents.map(a => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="font-medium">{a.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{t("automationsPage.voiceLabel", { voice: a.voice })}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {c.calling_agent_id && (
        <div className="rounded-lg border border-teal-100 bg-teal-50/60 px-3 py-2">
          <p className="text-xs text-teal-700">
            {t("automationsPage.makeCallInfo")}
          </p>
        </div>
      )}

      {!c.calling_agent_id && agents.length > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="h-3.5 w-3.5 shrink-0" />
          {t("automationsPage.selectAgentHint")}
        </p>
      )}
    </div>
  );
}

// ── Wait step editor (relative / fixed date / contact date field) ─────────────
function WaitStepEditor({ step, onChange }: {
  step: AutomationStep;
  onChange: (updated: AutomationStep) => void;
}) {
  const { t } = useTranslation();
  const { organizationId } = useOrganizationContext();
  const c = step.config;
  const set = (key: string, val: any) => onChange({ ...step, config: { ...c, [key]: val } });
  const waitMode = c.mode ?? "duration";

  // Date fields available to wait on: standard + custom (type date).
  const [dateFields, setDateFields] = useState<{ value: string; label: string }[]>([
    { value: "birthday", label: t("automationsPage.fieldBirthday") },
    { value: "expected_close_date", label: t("automationsPage.fieldExpectedCloseDate") },
  ]);
  useEffect(() => {
    if (!organizationId) return; // org-scoped: never mix other orgs' field defs
    supabase
      .from("custom_field_definitions")
      .select("key, label, field_type")
      .eq("organization_id", organizationId)
      .ilike("field_type", "%date%")
      .then(({ data }) => {
        if (data?.length) {
          setDateFields(prev => [
            ...prev,
            ...data.map((f: any) => ({ value: `custom:${f.key}`, label: f.label })),
          ]);
        }
      });
  }, [organizationId]);

  return (
    <div className="space-y-3">
      <div>
        <Label>{t("automationsPage.waitType")}</Label>
        <Select value={waitMode} onValueChange={v => set("mode", v)}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="duration">{t("automationsPage.waitDuration")}</SelectItem>
            <SelectItem value="until_date">{t("automationsPage.waitUntilDate")}</SelectItem>
            <SelectItem value="contact_date">{t("automationsPage.waitContactDate")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {waitMode === "until_date" && (
        <div>
          <Label>{t("automationsPage.waitUntil")}</Label>
          <Input
            type="datetime-local"
            className="mt-1"
            value={c.until_date ?? ""}
            onChange={e => set("until_date", e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t("automationsPage.waitUntilDateHint")}
          </p>
        </div>
      )}

      {waitMode === "contact_date" && (
        <div className="space-y-3">
          <div>
            <Label>{t("automationsPage.contactDateField")}</Label>
            <Select value={c.date_field ?? ""} onValueChange={v => set("date_field", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder={t("automationsPage.selectFieldPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {dateFields.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("automationsPage.whenToSend")}</Label>
            <div className="flex gap-2 mt-1 items-center">
              <Input
                type="number" min={0} className="w-20"
                value={c.offset_value ?? 0}
                onChange={e => set("offset_value", Number(e.target.value))}
              />
              <span className="text-sm text-muted-foreground">{t("automationsPage.days")}</span>
              <Select value={c.offset_dir ?? "on"} onValueChange={v => set("offset_dir", v)}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="before">{t("automationsPage.before")}</SelectItem>
                  <SelectItem value="on">{t("automationsPage.sameDay")}</SelectItem>
                  <SelectItem value="after">{t("automationsPage.after")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>{t("automationsPage.sendHour")}</Label>
            <Input
              type="number" min={0} max={23} className="w-24 mt-1"
              value={c.send_hour ?? 9}
              onChange={e => set("send_hour", Number(e.target.value))}
            />
            <span className="text-xs text-muted-foreground ml-2">{t("automationsPage.localHourRange")}</span>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={c.annual ?? false}
              onChange={e => set("annual", e.target.checked)}
            />
            {t("automationsPage.annualDateNextOccurrence")}
          </label>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
            <p>
              {t("automationsPage.waitContactDateInfo")}
            </p>
          </div>
        </div>
      )}

      {waitMode === "duration" && (
        <div>
          <Label>{t("automationsPage.waitDurationLabel")}</Label>
          <div className="flex gap-2 mt-1">
            <Input type="number" min={1} value={c.delay_value ?? 1} onChange={e => set("delay_value", Number(e.target.value))} className="w-24" />
            <Select value={c.delay_unit ?? "days"} onValueChange={v => set("delay_unit", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="seconds">{t("automationsPage.seconds")}</SelectItem>
                <SelectItem value="minutes">{t("automationsPage.minutes")}</SelectItem>
                <SelectItem value="hours">{t("automationsPage.hours")}</SelectItem>
                <SelectItem value="days">{t("automationsPage.daysUnit")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

// ── "Ir a otra automatización" editor ─────────────────────────────────────────
function EnrollAutomationEditor({ step, onChange }: {
  step: AutomationStep;
  onChange: (updated: AutomationStep) => void;
}) {
  const { t } = useTranslation();
  const { organizationId } = useOrganizationContext();
  const c = step.config;
  const [autos, setAutos] = useState<{ id: string; name: string; is_active: boolean }[]>([]);
  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from("automations")
      .select("id, name, is_active")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true })
      .then(({ data }) => setAutos(data || []));
  }, [organizationId]);

  return (
    <div className="space-y-3">
      <div>
        <Label>{t("automationsPage.destinationAutomation")}</Label>
        <Select
          value={c.automation_id ?? ""}
          onValueChange={v => {
            const a = autos.find(x => x.id === v);
            onChange({ ...step, config: { ...c, automation_id: v, automation_name: a?.name ?? "" } });
          }}
        >
          <SelectTrigger className="mt-1"><SelectValue placeholder={t("automationsPage.selectAutomationPlaceholder")} /></SelectTrigger>
          <SelectContent>
            {autos.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("automationsPage.noOtherAutomations")}</div>}
            {autos.map(a => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}{!a.is_active && <span className="text-muted-foreground ml-1 text-xs">{t("automationsPage.inactiveParen")}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-700">
        {t("automationsPage.enrollAutomationInfo")}
      </div>
    </div>
  );
}

// ── Step config fields ────────────────────────────────────────────────────────
function StepConfigEditor({ step, onChange, steps = [], stepIndex = -1 }: {
  step: AutomationStep;
  onChange: (updated: AutomationStep) => void;
  steps?: AutomationStep[];
  stepIndex?: number;
}) {
  const { t } = useTranslation();
  const { organizationId } = useOrganizationContext();
  const c = step.config;
  const set = (key: string, val: any) => onChange({ ...step, config: { ...c, [key]: val } });

  // Pasos posteriores a este (destinos válidos de una rama)
  const laterSteps = steps.map((s, idx) => ({ s, idx })).filter(({ idx }) => idx > stepIndex);
  const stepLabel = (s: AutomationStep, idx: number) => `${idx + 1}. ${STEP_META[s.type]?.label ?? s.type}${stepSummary(s) ? ` · ${stepSummary(s)}` : ""}`.slice(0, 60);

  // Detectar botones de la plantilla enviada en el paso anterior más cercano
  const detectButtons = async () => {
    let tplName = "";
    for (let i = stepIndex - 1; i >= 0; i--) {
      if (steps[i].type === "send_whatsapp" && steps[i].config?.template_name) { tplName = steps[i].config.template_name; break; }
      if (steps[i].type === "send_whatsapp_interactive") { // botones definidos en el propio paso
        const btns = (steps[i].config?.buttons ?? []).filter((b: string) => b && b.trim());
        if (btns.length) { set("cases", btns.map((b: string) => ({ match: b, next_index: stepIndex + 1 }))); return; }
      }
    }
    if (!tplName || !organizationId) { toast.error("No encontré una plantilla con botones en los pasos anteriores"); return; }
    const { data } = await supabase.from("whatsapp_templates").select("buttons").eq("organization_id", organizationId).eq("name", tplName).maybeSingle();
    // Solo botones de respuesta rápida: son los únicos que devuelven un mensaje
    // al tocarlos. URL / llamada / formulario no producen respuesta para ramificar.
    const all = (data?.buttons ?? []) as any[];
    const qr = all.filter((b: any) => {
      const type = String(b?.type ?? "").toUpperCase();
      return type === "QUICK_REPLY" || type === "" ; // "" = plantillas legacy sin tipo
    }).map((b: any) => b.text).filter(Boolean);
    if (!qr.length) {
      const other = all.length ? " (tiene botones de URL/llamada/formulario, que no devuelven respuesta para ramificar)" : "";
      toast.error(`Esa plantilla no tiene botones de respuesta rápida${other}`);
      return;
    }
    set("cases", qr.map((b: string) => ({ match: b, next_index: stepIndex + 1 })));
    toast.success(`${qr.length} botón(es) de respuesta rápida detectado(s)`);
  };

  if (step.type === "wait") return <WaitStepEditor step={step} onChange={onChange} />;

  if (step.type === "send_whatsapp_interactive") return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Mensaje</Label>
        <Textarea rows={4} value={c.body_text ?? ""} onChange={e => set("body_text", e.target.value)}
          placeholder="Hola {{contact.first_name}}, ¿quieres agendar tu valoración?" />
        <p className="text-[11px] text-muted-foreground mt-1">Admite variables como {"{{contact.first_name}}"} o {"{{custom.clave}}"}.</p>
      </div>
      <div>
        <Label className="text-xs">Botones (hasta 3, máx. 20 caracteres c/u)</Label>
        {[0, 1, 2].map(i => (
          <Input key={i} className="mt-1.5" maxLength={20} value={(c.buttons ?? [])[i] ?? ""}
            placeholder={i === 0 ? "Ej: Sí, quiero agendar" : "(opcional)"}
            onChange={e => {
              const btns = [...(c.buttons ?? ["", "", ""])];
              btns[i] = e.target.value;
              set("buttons", btns);
            }} />
        ))}
      </div>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
        Mensaje libre (no plantilla): solo se entrega dentro de la ventana de 24h desde el último mensaje del contacto. Ideal justo después de que el lead escribe.
      </div>

      {/* Ramas por botón (igual que en la plantilla) */}
      {(() => {
        const qr = (c.buttons ?? []).filter((b: string) => b && b.trim());
        if (!qr.length) return null;
        const br = c.branches || {};
        const setBr = (patch: any) => set("branches", { ...br, ...patch });
        const later = steps.map((st, idx) => ({ st, idx })).filter(({ idx }) => idx > stepIndex);
        const lbl = (st: AutomationStep, idx: number) => `${idx + 1}. ${STEP_META[st.type]?.label ?? st.type}${stepSummary(st) ? ` · ${stepSummary(st)}` : ""}`.slice(0, 55);
        const Picker = ({ value, onPick, ph }: { value: any; onPick: (v: number | null) => void; ph: string }) => (
          <Select value={value != null ? String(value) : ""} onValueChange={v => onPick(v === "__none__" ? null : parseInt(v))}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={ph} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-xs italic">continúa al siguiente paso</SelectItem>
              {later.map(({ st, idx }) => <SelectItem key={st.id} value={String(idx)} className="text-xs">{lbl(st, idx)}</SelectItem>)}
            </SelectContent>
          </Select>
        );
        return (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Ramas por botón</Label>
              <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                <input type="checkbox" checked={!!br.enabled} onChange={e => setBr({ enabled: e.target.checked })} /> Activar
              </label>
            </div>
            {!br.enabled ? (
              <p className="text-[11px] text-muted-foreground">Actívalo para reaccionar según el botón que toque el contacto. Añade los pasos de cada rama desde el nodo con "+ acción".</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Esperar respuesta hasta</span>
                  <Input type="number" min={1} className="h-7 w-16 text-xs" value={br.timeout_value ?? 24} onChange={e => setBr({ timeout_value: parseInt(e.target.value) || 24 })} />
                  <Select value={br.timeout_unit ?? "hours"} onValueChange={v => setBr({ timeout_unit: v })}>
                    <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="minutes">minutos</SelectItem><SelectItem value="hours">horas</SelectItem><SelectItem value="days">días</SelectItem></SelectContent>
                  </Select>
                </div>
                {qr.map((b: string, i: number) => {
                  const cur = (br.cases ?? []).find((x: any) => x.match === b);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="shrink-0 w-32 truncate rounded bg-white dark:bg-emerald-900/30 border px-2 py-1 text-[11px] font-medium" title={b}>▸ {b}</span>
                      <Picker value={cur?.next_index} ph="¿qué acción? →" onPick={v => { const others = (br.cases ?? []).filter((x: any) => x.match !== b); setBr({ cases: v == null ? others : [...others, { match: b, next_index: v }] }); }} />
                    </div>
                  );
                })}
                <div className="flex items-center gap-2"><span className="shrink-0 w-32 text-[11px] text-muted-foreground">Otra respuesta</span><Picker value={br.default_next_index} ph="continúa" onPick={v => setBr({ default_next_index: v })} /></div>
                <div className="flex items-center gap-2"><span className="shrink-0 w-32 text-[11px] text-muted-foreground">Sin respuesta</span><Picker value={br.no_reply_next_index} ph="continúa" onPick={v => setBr({ no_reply_next_index: v })} /></div>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );

  if (step.type === "reply_switch") return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">Ramas — un camino por cada botón</Label>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={detectButtons}>Detectar botones ↑</Button>
      </div>
      {(c.cases ?? []).map((cs: any, i: number) => (
        <div key={i} className="rounded-lg border p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-muted-foreground shrink-0">Si toca</span>
            <Input className="h-7 text-xs flex-1" placeholder='Ej: "QUIERO AGENDAR"' value={cs.match ?? ""}
              onChange={e => { const cases = [...(c.cases ?? [])]; cases[i] = { ...cases[i], match: e.target.value }; set("cases", cases); }} />
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive shrink-0"
              onClick={() => set("cases", (c.cases ?? []).filter((_: any, idx: number) => idx !== i))}>×</Button>
          </div>
          <div className="flex items-center gap-2 pl-1">
            <span className="text-[10px] text-muted-foreground shrink-0">ir a →</span>
            <Select value={String(cs.next_index ?? "")} onValueChange={v => { const cases = [...(c.cases ?? [])]; cases[i] = { ...cases[i], next_index: parseInt(v) }; set("cases", cases); }}>
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="elige el paso destino…" /></SelectTrigger>
              <SelectContent>
                {laterSteps.map(({ s, idx }) => <SelectItem key={s.id} value={String(idx)} className="text-xs">{stepLabel(s, idx)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => set("cases", [...(c.cases ?? []), { match: "", next_index: stepIndex + 1 }])}>+ Añadir rama</Button>
      <div>
        <Label className="text-xs">Si no coincide con ningún botón, ir a (opcional)</Label>
        <Select value={c.default_next_index != null ? String(c.default_next_index) : ""} onValueChange={v => set("default_next_index", v === "__none__" ? null : parseInt(v))}>
          <SelectTrigger className="h-7 text-xs mt-1"><SelectValue placeholder="continúa al siguiente paso" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs italic">continúa al siguiente paso</SelectItem>
            {laterSteps.map(({ s, idx }) => <SelectItem key={s.id} value={String(idx)} className="text-xs">{stepLabel(s, idx)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground flex items-start gap-1">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        Estructura: plantilla con botones → "Esperar respuesta" → este paso. Añade los pasos de cada rama (enviar WhatsApp, email, llamada…) y elígelos como destino. Cierra cada rama con "Fin de rama" para que no siga con la otra.
      </p>
    </div>
  );

  if (step.type === "end_flow") return (
    <p className="text-sm text-muted-foreground">Este paso termina el flujo. Úsalo al final de cada rama para que una rama no continúe con los pasos de la otra.</p>
  );

  if (step.type === "send_whatsapp_flow") return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">ID del Flow (de Meta Flow Builder)</Label>
        <Input value={c.flow_id ?? ""} onChange={e => set("flow_id", e.target.value)} placeholder="Ej: 1234567890123456" />
        <p className="text-[11px] text-muted-foreground mt-1">Crea y publica el formulario en WhatsApp Manager → Flows; aquí solo pegas su ID.</p>
      </div>
      <div>
        <Label className="text-xs">Mensaje que acompaña al formulario</Label>
        <Textarea rows={3} value={c.body_text ?? ""} onChange={e => set("body_text", e.target.value)}
          placeholder="Completa estos datos para agendar tu cita 👇" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Texto del botón</Label>
          <Input maxLength={30} value={c.cta_text ?? ""} onChange={e => set("cta_text", e.target.value)} placeholder="Abrir formulario" />
        </div>
        <div>
          <Label className="text-xs">Pantalla inicial (opcional)</Label>
          <Input value={c.screen ?? ""} onChange={e => set("screen", e.target.value)} placeholder="Ej: WELCOME" />
        </div>
      </div>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
        Cuando el contacto complete el formulario, sus respuestas se guardan automáticamente como campos personalizados del lead, y el paso "Esperar respuesta" continúa el flujo con ellas.
      </div>
    </div>
  );

  if (step.type === "wait_reply") return (
    <div className="space-y-3">
      <Label className="text-xs">Esperar la respuesta del contacto hasta</Label>
      <div className="grid grid-cols-2 gap-2">
        <Input type="number" min={1} value={c.timeout_value ?? 24}
          onChange={e => set("timeout_value", parseInt(e.target.value) || 24)} />
        <Select value={c.timeout_unit ?? "hours"} onValueChange={v => set("timeout_unit", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="minutes">minutos</SelectItem>
            <SelectItem value="hours">horas</SelectItem>
            <SelectItem value="days">días</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground flex items-start gap-1">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        Si el contacto responde, el flujo continúa de inmediato con su respuesta disponible en los pasos siguientes. Si no responde en el plazo, continúa igual (respuesta vacía). Mientras espera, el Agente de IA no interviene en la conversación.
      </p>
    </div>
  );

  if (step.type === "reply_condition") return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">{t("automationsPage.operator")}</Label>
          <Select value={c.operator ?? "contains"} onValueChange={v => set("operator", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="contains">{t("automationsPage.opContains")}</SelectItem>
              <SelectItem value="equals">{t("automationsPage.opEquals")}</SelectItem>
              <SelectItem value="not_empty">{t("automationsPage.opNotEmpty")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("automationsPage.value")}</Label>
          <Input value={c.value ?? ""} onChange={e => set("value", e.target.value)}
            placeholder='Ej: "sí" o el texto del botón' />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">{t("automationsPage.skipIfTrue")}</Label>
          <Input type="number" min={0} className="mt-1"
            value={c.true_next_index !== undefined ? c.true_next_index : 0}
            onChange={e => set("true_next_index", parseInt(e.target.value) || 0)} />
        </div>
        <div>
          <Label className="text-xs">{t("automationsPage.skipIfFalse")}</Label>
          <Input type="number" min={1} className="mt-1"
            value={c.false_skip_count ?? 1}
            onChange={e => set("false_skip_count", parseInt(e.target.value) || 1)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground flex items-start gap-1">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        Evalúa lo que el contacto respondió en el paso "Esperar respuesta" anterior (texto o botón tocado). Compara sin distinguir mayúsculas.
      </p>
    </div>
  );

  if (step.type === "send_email") return <EmailStepEditor step={step} onChange={onChange} />;

  if (step.type === "send_whatsapp") return <WhatsAppStepEditor step={step} onChange={onChange} steps={steps} stepIndex={stepIndex} />;

  if (step.type === "add_tag") return (
    <div>
      <Label>{t("automationsPage.tagToAdd")}</Label>
      <TagPicker value={c.tag ?? ""} onChange={v => set("tag", v)} placeholder={t("automationsPage.chooseOrCreateTag")} />
    </div>
  );

  if (step.type === "update_contact") return <UpdateContactEditor step={step} onChange={onChange} />;

  if (step.type === "assign_owner") return (
    <AssignOwnerStepEditor step={step} onChange={onChange} />
  );

  if (step.type === "remove_tag") return (
    <div>
      <Label>{t("automationsPage.tagToRemove")}</Label>
      <TagPicker value={c.tag ?? ""} onChange={v => set("tag", v)} placeholder={t("automationsPage.chooseTag")} allowCreate={false} />
    </div>
  );

  if (step.type === "move_pipeline_stage") return (
    <MovePipelineStepEditor step={step} onChange={onChange} />
  );

  if (step.type === "create_task") return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">{t("automationsPage.taskTitle")}</Label>
        <Input className="mt-1" value={c.title ?? ""} onChange={e => set("title", e.target.value)} placeholder="Llamar a {{contact.name}}" />
      </div>
      <div>
        <Label className="text-xs">{t("automationsPage.dueInDays")}</Label>
        <Input type="number" min={0} className="mt-1" value={c.due_in_days ?? 1} onChange={e => set("due_in_days", parseInt(e.target.value) || 1)} />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="assign_owner_task" checked={c.assign_to_owner ?? true} onChange={e => set("assign_to_owner", e.target.checked)} />
        <Label htmlFor="assign_owner_task" className="text-xs cursor-pointer">{t("automationsPage.assignToContactRep")}</Label>
      </div>
    </div>
  );

  if (step.type === "send_webhook") return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">{t("automationsPage.webhookUrl")}</Label>
        <Input className="mt-1 font-mono text-xs" value={c.url ?? ""} onChange={e => set("url", e.target.value)} placeholder="https://n8n.tudominio.com/webhook/xyz" />
        <p className="text-[11px] text-muted-foreground mt-1">{t("automationsPage.webhookHint")}</p>
      </div>
      <div>
        <Label className="text-xs">{t("automationsPage.httpMethod")}</Label>
        <Select value={c.method ?? "POST"} onValueChange={v => set("method", v)}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="GET">GET</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="include_contact" checked={c.include_contact ?? true} onChange={e => set("include_contact", e.target.checked)} />
        <Label htmlFor="include_contact" className="text-xs cursor-pointer">{t("automationsPage.includeContactInPayload")}</Label>
      </div>
    </div>
  );

  if (step.type === "notify_owner") return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">{t("automationsPage.notificationMessage")}</Label>
        <Textarea className="mt-1" rows={3} value={c.message ?? ""} onChange={e => set("message", e.target.value)} placeholder="Nuevo evento: {{contact.name}} completó una acción." />
        <p className="text-[11px] text-muted-foreground mt-1">{t("automationsPage.notifyOwnerHint")}</p>
      </div>
    </div>
  );

  if (step.type === "make_call") return (
    <MakeCallStepEditor step={step} onChange={onChange} />
  );

  if (step.type === "enroll_automation") return (
    <EnrollAutomationEditor step={step} onChange={onChange} />
  );

  if (step.type === "condition") return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">{t("automationsPage.field")}</Label>
          <Select value={c.field ?? "tags"} onValueChange={v => set("field", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tags">{t("automationsPage.conditionTags")}</SelectItem>
              <SelectItem value="primary_email">{t("automationsPage.conditionEmail")}</SelectItem>
              <SelectItem value="lead_status">{t("automationsPage.conditionStatus")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("automationsPage.operator")}</Label>
          <Select value={c.operator ?? "contains"} onValueChange={v => set("operator", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="contains">{t("automationsPage.opContains")}</SelectItem>
              <SelectItem value="equals">{t("automationsPage.opEquals")}</SelectItem>
              <SelectItem value="not_empty">{t("automationsPage.opNotEmpty")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("automationsPage.value")}</Label>
          <Input value={c.value ?? ""} onChange={e => set("value", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">{t("automationsPage.skipIfTrue")}</Label>
          <Input type="number" min={0} className="mt-1"
            value={c.true_next_index !== undefined ? c.true_next_index : 0}
            onChange={e => set("true_next_index", parseInt(e.target.value) || 0)}
            placeholder={t("automationsPage.skipIfTruePlaceholder")} />
        </div>
        <div>
          <Label className="text-xs">{t("automationsPage.skipIfFalse")}</Label>
          <Input type="number" min={1} className="mt-1"
            value={c.false_skip_count ?? 1}
            onChange={e => set("false_skip_count", parseInt(e.target.value) || 1)}
            placeholder={t("automationsPage.skipIfFalsePlaceholder")} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground flex items-start gap-1">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        {t("automationsPage.conditionHint")}
      </p>
    </div>
  );

  return null;
}

// ── Enroll Dialog ─────────────────────────────────────────────────────────────
function EnrollDialog({ automationId, open, onClose }: { automationId: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { organizationId } = useOrganizationContext();
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    if (!open || !organizationId) return;
    setLoading(true);
    supabase.from("contacts").select("id, first_name, last_name, primary_email, company_name")
      .eq("organization_id", organizationId)
      .order("first_name").limit(500)
      .then(({ data }) => { setContacts(data || []); setLoading(false); });
  }, [open, organizationId]);

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    return `${c.first_name || ""} ${c.last_name || ""} ${c.primary_email || ""}`.toLowerCase().includes(q);
  });

  const toggle = (id: string) => setSelected(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handleEnroll = async () => {
    setEnrolling(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setEnrolling(false); return; }
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/automation-runner`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "enroll", automation_id: automationId, contact_ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast({ title: t("automationsPage.contactsEnrolledToast", { count: data.enrolled }) });
      setSelected(new Set()); onClose();
    } catch (e: any) {
      toast({ title: t("automationsPage.error"), description: e.message, variant: "destructive" });
    } finally { setEnrolling(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader><DialogTitle>{t("automationsPage.enrollContacts")}</DialogTitle></DialogHeader>
        <Input placeholder={t("automationsPage.searchPlaceholder")} value={search} onChange={e => setSearch(e.target.value)} className="shrink-0" />
        <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0">
          {loading && <p className="text-sm text-center text-muted-foreground py-6">{t("automationsPage.loading")}</p>}
          {filtered.map(c => (
            <label key={c.id} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="accent-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.first_name} {c.last_name}</p>
                <p className="text-xs text-muted-foreground truncate">{c.primary_email || t("automationsPage.noEmail")}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between pt-3 border-t shrink-0">
          <span className="text-sm text-muted-foreground">{t("automationsPage.selectedCount", { count: selected.size })}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t("automationsPage.cancel")}</Button>
            <Button onClick={handleEnroll} disabled={!selected.size || enrolling}>
              {enrolling ? t("automationsPage.enrolling") : t("automationsPage.enroll")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Flow Builder (full-screen) ────────────────────────────────────────────────
function AutomationBuilder({
  automation,
  onBack,
  onSaved,
}: {
  automation: Automation | null;
  onBack: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { organizationId } = useOrganizationContext();
  const { canAccessPowerFeatures: canEditBuilder } = usePermissions();

  // Editable meta
  const [name, setName] = useState(automation?.name ?? "Nueva automatización");
  const [description, setDescription] = useState(automation?.description ?? "");
  const [isActive, setIsActive] = useState(automation?.is_active ?? false);
  // Multi-trigger: a flow can fire on ANY of several triggers. Initialize from the
  // automation's `triggers` array, falling back to the legacy single trigger.
  const [triggers, setTriggers] = useState<{ type: string; config: Record<string, any> }[]>(
    () => {
      const t = (automation as any)?.triggers;
      if (Array.isArray(t) && t.length) return t.map((x: any) => ({ type: x.type, config: x.config ?? {} }));
      return [{ type: automation?.trigger_type ?? "manual", config: automation?.trigger_config ?? {} }];
    }
  );
  // Primary trigger kept for display / node position (_nodePos lives here).
  const triggerType = triggers[0]?.type ?? "manual";
  const triggerConfig = triggers[0]?.config ?? {};

  // Steps state (source of truth)
  const [steps, setSteps] = useState<AutomationStep[]>(automation?.steps ?? []);

  // Free-canvas node positions (persisted alongside steps on save)
  const [nodePositions, setNodePositions] = useState<NodePositions>(() => {
    const pos: NodePositions = {};
    // Restore trigger position from trigger_config._nodePos
    if (automation?.trigger_config?._nodePos) {
      pos["trigger"] = automation.trigger_config._nodePos;
    }
    // Restore each step's position
    for (const s of (automation?.steps ?? [])) {
      if (s.position) pos[s.id] = s.position;
    }
    return pos;
  });

  // UI state — declared BEFORE any useEffect / useMemo that references them
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [branchWire, setBranchWire] = useState<{ stepId: string; match: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);

  // Flow actions (shared via context) — also before the useEffect
  const onInsertStep = useCallback((idx: number) => {
    setBranchWire(null);
    setInsertIndex(idx);
    setPickerOpen(true);
  }, []);

  // "+" desde un botón: agrega un paso y lo conecta como rama de ese botón.
  const onAddBranchStep = useCallback((stepId: string, match: string) => {
    setSteps(prev => {
      const idx = prev.findIndex(s => s.id === stepId);
      setInsertIndex(idx >= 0 ? idx + 1 : prev.length);
      return prev;
    });
    setBranchWire({ stepId, match });
    setPickerOpen(true);
  }, []);

  // Keep module-level ref current so AddableEdge can call it even after
  // React Flow strips functions from edge.data during its internal diffing.
  _onInsertStep = onInsertStep;

  const onSelectNode = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  const onDeleteStep = useCallback((id: string) => {
    setSteps(prev => prev.filter(s => s.id !== id));
    setSelectedId(null);
  }, []);

  // React Flow state (derived from steps)
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Rebuild flow whenever steps OR positions change.
  // The "+" button callback is intentionally NOT injected into edge.data because
  // React Flow's internal diffing strips non-serializable values; instead we
  // read it from the module-level _onInsertStep ref inside AddableEdge.
  useEffect(() => {
    const { nodes: n, edges: e } = buildFlow(steps, nodePositions);
    setNodes(n);
    setEdges(e);
  }, [steps, nodePositions]);

  // Capture final position when a node drag ends
  const handleNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id === "end") return;
    setNodePositions(prev => ({ ...prev, [node.id]: node.position }));
  }, []);

  const ctxValue = useMemo(
    () => ({ onInsertStep, onAddBranchStep, onSelectNode, onDeleteStep, selectedId, triggerType, triggerConfig, triggers, steps }),
    [onInsertStep, onAddBranchStep, onSelectNode, onDeleteStep, selectedId, triggerType, triggerConfig, triggers, steps]
  );

  // Handle step picker selection
  // Al insertar en la posición `at`, cualquier referencia de salto >= at debe +1.
  const shiftStepIndices = (st: AutomationStep, at: number): AutomationStep => {
    const bump = (v: any) => (v != null && Number(v) >= at ? Number(v) + 1 : v);
    const cfg: any = { ...st.config };
    if (st.type === "reply_switch") {
      cfg.cases = (cfg.cases ?? []).map((c: any) => ({ ...c, next_index: bump(c.next_index) }));
      cfg.default_next_index = bump(cfg.default_next_index);
    }
    if (st.type === "reply_condition" || st.type === "condition") {
      cfg.true_next_index = bump(cfg.true_next_index);
      cfg.false_next_index = bump(cfg.false_next_index);
    }
    if (st.type === "wait_reply") cfg.timeout_next_index = bump(cfg.timeout_next_index);
    if (st.type === "send_whatsapp" && cfg.branches?.enabled) {
      const br = { ...cfg.branches };
      br.cases = (br.cases ?? []).map((c: any) => ({ ...c, next_index: bump(c.next_index) }));
      br.default_next_index = bump(br.default_next_index);
      br.no_reply_next_index = bump(br.no_reply_next_index);
      cfg.branches = br;
    }
    return { ...st, config: cfg };
  };

  const handlePickStep = (type: AutomationStep["type"]) => {
    if (insertIndex === null) return;
    const at = insertIndex;
    const wire = branchWire;
    const newStep: AutomationStep = { id: genId(), type, config: defaultConfig(type) };
    setSteps(prev => {
      const shifted = prev.map(s => shiftStepIndices(s, at));
      const next = [...shifted];
      next.splice(at, 0, newStep);
      if (wire) {
        const wi = next.findIndex(s => s.id === wire.stepId);
        if (wi >= 0) {
          const st = next[wi];
          const br = { ...(st.config.branches ?? {}), enabled: true };
          const cases = [...(br.cases ?? [])].filter((c: any) => c.match !== wire.match);
          cases.push({ match: wire.match, next_index: at });
          next[wi] = { ...st, config: { ...st.config, branches: { ...br, cases } } };
        }
      }
      return next;
    });
    setSelectedId(newStep.id);
    setInsertIndex(null);
    setBranchWire(null);
  };

  // Update step config
  const handleStepChange = (updated: AutomationStep) => {
    setSteps(prev => prev.map(s => s.id === updated.id ? updated : s));
  };

  // Save
  const handleSave = async () => {
    if (!name.trim()) { toast({ title: t("automationsPage.nameRequired"), variant: "destructive" }); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("automationsPage.notAuthenticated"));

      // Embed positions into steps and trigger_config so they survive a page reload
      const stepsWithPos = steps.map(s => ({
        ...s,
        position: nodePositions[s.id] ?? s.position ?? undefined,
      }));
      // Persist the trigger-node position inside the PRIMARY trigger's config.
      const primaryConfigWithPos = nodePositions["trigger"]
        ? { ...(triggers[0]?.config ?? {}), _nodePos: nodePositions["trigger"] }
        : (triggers[0]?.config ?? {});
      const triggersToSave = triggers.map((trg, i) =>
        i === 0 ? { type: trg.type, config: primaryConfigWithPos } : { type: trg.type, config: trg.config ?? {} }
      );

      const payload = {
        name, description, is_active: isActive,
        // Legacy single-trigger fields (kept for backward compatibility) = primary trigger
        trigger_type: triggersToSave[0]?.type ?? "manual",
        trigger_config: primaryConfigWithPos,
        // Multi-trigger fields
        triggers: triggersToSave,
        trigger_types: triggersToSave.map(trg => trg.type),
        steps: stepsWithPos, user_id: user.id, updated_at: new Date().toISOString(),
      };
      let err;
      if (automation?.id) {
        ({ error: err } = await supabase.from("automations").update(payload).eq("id", automation.id));
      } else {
        ({ error: err } = await supabase.from("automations").insert({ ...payload, created_at: new Date().toISOString(), ...(organizationId ? { organization_id: organizationId } : {}) }));
      }
      if (err) throw err;
      toast({ title: t("automationsPage.savedToast") });
      onSaved();
      onBack();
    } catch (e: any) {
      toast({ title: t("automationsPage.saveErrorToast"), description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const selectedStep = steps.find(s => s.id === selectedId) || null;
  const panelOpen = selectedId !== null;

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0 z-10">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1 min-w-0">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            className="h-8 text-sm font-semibold border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0 max-w-xs"
            placeholder={t("automationsPage.automationNamePlaceholder")}
          />
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <span>{isActive ? t("automationsPage.active") : t("automationsPage.inactive")}</span>
        </div>
        {automation?.id && (
          <Button variant="outline" size="sm" onClick={() => setEnrollOpen(true)} disabled={!isActive}>
            <Play className="h-3.5 w-3.5 mr-1.5" />{t("automationsPage.enroll")}
          </Button>
        )}
        {canEditBuilder && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? t("automationsPage.saving") : t("automationsPage.save")}
          </Button>
        )}
      </div>

      {/* ── Canvas + panel ── */}
      <div className="relative flex-1 overflow-hidden">
        <FlowCtx.Provider value={ctxValue}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.4 }}
            minZoom={0.3}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={true}
            nodesConnectable={false}
            onNodeDragStop={handleNodeDragStop}
            onNodeClick={(_, node) => { if (node.id !== "end") setSelectedId(node.id); }}
            onPaneClick={() => setSelectedId(null)}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
            <Controls position="bottom-right" showInteractive={false} className="!bottom-6 !right-6" />
            <Panel position="top-right" className="!m-0 !p-0">
              {/* "+" hint if flow is empty */}
              {steps.length === 0 && (
                <div className="mr-4 mt-4 flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs text-slate-500 shadow">
                  <Info className="h-3.5 w-3.5 text-indigo-400" />
                  {t("automationsPage.emptyFlowHintPre")}<span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-indigo-400 text-indigo-500 font-bold">+</span>{t("automationsPage.emptyFlowHintPost")}
                </div>
              )}
            </Panel>
          </ReactFlow>
        </FlowCtx.Provider>

        {/* Right config panel */}
        <div
          className={`absolute right-0 top-0 h-full w-80 border-l bg-background shadow-xl transition-transform duration-200 z-20 flex flex-col ${
            panelOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
          }`}
        >
          {panelOpen && selectedId && (
            <NodeConfigPanel
              selectedId={selectedId}
              steps={steps}
              triggers={triggers}
              onClose={() => setSelectedId(null)}
              onStepChange={handleStepChange}
              onTriggersChange={setTriggers}
            />
          )}
        </div>
      </div>

      {/* Step picker */}
      <StepPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handlePickStep} />

      {/* Enroll */}
      {automation?.id && (
        <EnrollDialog automationId={automation.id} open={enrollOpen} onClose={() => setEnrollOpen(false)} />
      )}
    </div>
  );
}

// ── Automation list card ──────────────────────────────────────────────────────
function AutomationCard({
  automation,
  onEdit,
  onDelete,
  onToggle,
  onEnroll,
  canEdit = true,
}: {
  automation: Automation;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  canEdit?: boolean;
  onEnroll: () => void;
}) {
  const { t } = useTranslation();
  const stepColors = (automation.steps || []).slice(0, 6);

  return (
    <div className="group rounded-xl border bg-card hover:shadow-md transition-all">
      <div className="flex items-start gap-3 p-4">
        {/* Active toggle */}
        <Switch checked={automation.is_active} onCheckedChange={onToggle} disabled={!canEdit} className="shrink-0 mt-0.5" />

        {/* Info */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{automation.name}</h3>
            <Badge variant="secondary" className={automation.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}>
              {automation.is_active ? t("automationsPage.active") : t("automationsPage.inactive")}
            </Badge>
            <Badge variant="outline" className="text-xs hidden sm:inline-flex">{TRIGGER_LABELS[automation.trigger_type] || automation.trigger_type}</Badge>
          </div>
          {automation.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{automation.description}</p>}
          <div className="flex items-center gap-3 mt-2">
            {/* Step pills */}
            <div className="flex items-center gap-1">
              {stepColors.map((step, i) => {
                const m = STEP_META[step.type];
                const Icon = m.icon;
                return (
                  <span key={i} title={m.label} className="flex h-6 w-6 items-center justify-center rounded-full border" style={{ background: m.bg, borderColor: m.border, color: m.color }}>
                    <Icon className="h-3 w-3" />
                  </span>
                );
              })}
              {(automation.steps?.length || 0) > 6 && (
                <span className="text-xs text-muted-foreground ml-1">+{automation.steps.length - 6}</span>
              )}
              {!automation.steps?.length && <span className="text-xs text-muted-foreground">{t("automationsPage.noSteps")}</span>}
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />{t("automationsPage.enrollmentsCount", { count: automation._enrollment_count || 0 })}
            </span>
          </div>
          {/* Actions — shown below on mobile */}
          <div className="flex items-center gap-1 mt-3 sm:hidden">
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onEnroll(); }} disabled={!automation.is_active}>
              <Play className="h-3.5 w-3.5 mr-1" />{t("automationsPage.enroll")}
            </Button>
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Edit className="h-3.5 w-3.5 mr-1" />{canEdit ? t("automationsPage.edit") : t("automationsPage.view")}
            </Button>
            {canEdit && (
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Actions — desktop only */}
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={onEnroll} disabled={!automation.is_active} title={!automation.is_active ? t("automationsPage.activateToEnroll") : undefined}>
              <Play className="h-3.5 w-3.5 mr-1" />{t("automationsPage.enroll")}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit className="h-3.5 w-3.5 mr-1" />{canEdit ? t("automationsPage.edit") : t("automationsPage.view")}
          </Button>
          {canEdit && (
            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-8 w-8" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AutomationsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { organizationId } = useOrganizationContext();
  const { canAccessPowerFeatures: canEdit } = usePermissions();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "builder">("list");
  const [editTarget, setEditTarget] = useState<Automation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null);
  const [enrollTarget, setEnrollTarget] = useState<Automation | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const useTemplate = (t: (typeof AUTOMATION_TEMPLATES)[number]) => {
    setEditTarget(templateToAutomation(t) as unknown as Automation);
    setShowTemplates(false);
    setView("builder");
  };

  const load = async () => {
    if (!organizationId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from("automations").select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    const ids = (data || []).map((a: Automation) => a.id);
    let countMap: Record<string, number> = {};
    if (ids.length) {
      const { data: counts } = await supabase.from("automation_enrollments").select("automation_id").in("automation_id", ids);
      (counts || []).forEach((r: any) => { countMap[r.automation_id] = (countMap[r.automation_id] || 0) + 1; });
    }
    setAutomations((data || []).map((a: Automation) => ({ ...a, _enrollment_count: countMap[a.id] || 0 })));
    setLoading(false);
  };

  // Re-run when the org context resolves (it's null on the very first render).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [organizationId]);

  // Deep-link: ?open=<id> (used by the AI assistant after creating a draft) opens
  // that automation's builder for review.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId || !automations.length) return;
    const a = automations.find(x => x.id === openId);
    if (a) { setEditTarget(a); setView("builder"); setSearchParams({}, { replace: true }); }
  }, [automations, searchParams, setSearchParams]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("automations").delete().eq("id", deleteTarget.id);
    if (error) { toast({ title: t("automationsPage.error"), description: error.message, variant: "destructive" }); return; }
    toast({ title: t("automationsPage.deletedToast") });
    setDeleteTarget(null);
    load();
  };

  const toggleActive = async (automation: Automation) => {
    await supabase.from("automations").update({ is_active: !automation.is_active, updated_at: new Date().toISOString() }).eq("id", automation.id);
    setAutomations(prev => prev.map(a => a.id === automation.id ? { ...a, is_active: !a.is_active } : a));
  };

  // ── Builder view (full screen, no AppLayout sidebar) ──
  // Single AppLayout so the sidebar never unmounts on view switches
  return (
    <AppLayout>
      {view === "builder" ? (
        /* ── Builder view ── */
        <BuilderErrorBoundary>
          <div className="h-full">
            <AutomationBuilder
              automation={editTarget}
              onBack={() => { setView("list"); setEditTarget(null); }}
              onSaved={load}
            />
          </div>
        </BuilderErrorBoundary>
      ) : (
        /* ── List view ── */
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-indigo-500" />
              <h1 className="text-xl font-bold">{t("automationsPage.title")}</h1>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setShowTemplates(true)}>
                  📚 <span className="ml-1.5 hidden sm:inline">{t("automationsPage.templates")}</span>
                </Button>
                <Button onClick={() => { setEditTarget(null); setView("builder"); }}>
                  <Plus className="h-4 w-4 mr-2" />{t("automationsPage.newAutomation")}
                </Button>
              </div>
            )}
          </div>


          {/* List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {loading && <div className="flex h-32 items-center justify-center text-muted-foreground"><p>{t("automationsPage.loading")}</p></div>}
            {!loading && automations.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
                  <Zap className="h-8 w-8 text-indigo-400" />
                </div>
                <p className="text-muted-foreground text-sm">{t("automationsPage.noAutomations")}{canEdit ? t("automationsPage.noAutomationsCanEdit") : ""}</p>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setShowTemplates(true)}>📚 {t("automationsPage.useTemplate")}</Button>
                    <Button onClick={() => { setEditTarget(null); setView("builder"); }}>
                      <Plus className="h-4 w-4 mr-2" />{t("automationsPage.fromScratch")}
                    </Button>
                  </div>
                )}
              </div>
            )}
            {automations.map(automation => (
              <AutomationCard
                key={automation.id}
                automation={automation}
                onEdit={() => { setEditTarget(automation); setView("builder"); }}
                onDelete={() => setDeleteTarget(automation)}
                onToggle={() => toggleActive(automation)}
                onEnroll={() => setEnrollTarget(automation)}
                canEdit={canEdit}
              />
            ))}
          </div>

          {/* Enroll dialog */}
          {enrollTarget && (
            <EnrollDialog automationId={enrollTarget.id} open={!!enrollTarget} onClose={() => setEnrollTarget(null)} />
          )}

          {/* Template library */}
          <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>📚 {t("automationsPage.templateLibrary")}</DialogTitle>
                <DialogDescription>{t("automationsPage.templateLibraryDesc")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-2">
                {TEMPLATE_CATEGORIES.map(cat => {
                  const items = AUTOMATION_TEMPLATES.filter(x => x.category === cat);
                  if (!items.length) return null;
                  return (
                    <div key={cat}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{cat}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {items.map(item => (
                          <button
                            key={item.key}
                            onClick={() => useTemplate(item)}
                            className="text-left rounded-xl border bg-card p-4 hover:border-indigo-400 hover:shadow-md transition-all group"
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-2xl leading-none">{item.emoji}</span>
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-sm group-hover:text-indigo-600 transition-colors">{item.name}</p>
                                <p className="text-xs text-muted-foreground mt-1 leading-snug">{item.description}</p>
                                {item.badges && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {item.badges.map(b => (
                                      <span key={b} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{b}</span>
                                    ))}
                                  </div>
                                )}
                                {t.note && <p className="text-[10px] text-amber-600 mt-1.5">⚠️ {t.note}</p>}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>

          {/* Delete confirm */}
          <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("automationsPage.deleteAutomationTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("automationsPage.deleteAutomationDesc", { name: deleteTarget?.name })}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("automationsPage.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("automationsPage.delete")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </AppLayout>
  );
}
