// ══════════════════════════════════════════════════════════════════════
//  AutomationsPage — Visual Flow Builder (n8n-style)
// ══════════════════════════════════════════════════════════════════════
import "@xyflow/react/dist/style.css";

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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import {
  Zap, Plus, Trash2, Edit, ArrowLeft, Save, Play, Users,
  Clock, Tag, User, X, ChevronDown,
  Info, Settings2, FileText, Search,
  Bell, UserCheck, ListTodo, Timer, ArrowRightLeft,
  KanbanSquare, CheckSquare2,
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
  type: "wait" | "send_email" | "send_whatsapp" | "add_tag" | "remove_tag" | "update_contact" | "condition" | "assign_owner" | "move_pipeline_stage" | "create_task" | "send_webhook" | "notify_owner";
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
};

// ── Step groups for organized picker ──────────────────────────────────────────
const STEP_GROUPS: { label: string; types: string[] }[] = [
  { label: "Comunicación",  types: ["send_email", "send_whatsapp", "notify_owner"] },
  { label: "Contacto",      types: ["add_tag", "remove_tag", "update_contact", "assign_owner"] },
  { label: "Pipeline",      types: ["move_pipeline_stage", "create_task"] },
  { label: "Control",       types: ["wait", "condition", "send_webhook"] },
];

const TRIGGER_LABELS: Record<string, string> = {
  manual:                  "Manual",
  contact_created:         "Contacto creado",
  tag_added:               "Tag añadido",
  contact_stage_changed:   "Etapa de lead cambiada",
  whatsapp_incoming:       "WhatsApp entrante",
  scheduled:               "Programado",
  meta_lead_form:          "Formulario de Meta Lead Ads",
  landing_form_submitted:  "Formulario de Landing Page",
  email_opened:            "Email abierto",
  email_clicked:           "Email — link cliqueado",
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
    case "assign_owner":        return { mode: "specific", owner_id: "", owner_name: "", owner_ids: [], owner_names: [] };
    case "move_pipeline_stage": return { pipeline_id: "", stage_id: "", stage_name: "" };
    case "create_task":         return { title: "", due_in_days: 1, assign_to_owner: true };
    case "send_webhook":        return { url: "", method: "POST", include_contact: true };
    case "notify_owner":        return { message: "Nuevo evento en contacto {{contact.name}}" };
    default:                    return {};
  }
}

function stepSummary(step: AutomationStep): string {
  const c = step.config || {};
  switch (step.type) {
    case "wait":           return `${c.delay_value} ${c.delay_unit}`;
    case "send_email":     return c.subject ? `"${c.subject}"` : "(sin asunto)";
    case "send_whatsapp":  return c.template_name || "(sin plantilla)";
    case "add_tag":             return c.tag ? `"${c.tag}"` : "(sin tag)";
    case "remove_tag":          return c.tag ? `"${c.tag}"` : "(sin tag)";
    case "update_contact":      return c.field ? `${c.field} = ${c.value}` : "(sin campo)";
    case "condition":           return `${c.field} ${c.operator} ${c.value || "?"}`;
    case "assign_owner":
      if (c.mode === "round_robin") return c.owner_names?.length ? `Round Robin (${c.owner_names.length})` : "Round Robin";
      return c.owner_name ? `→ ${c.owner_name}` : "(sin asignar)";
    case "move_pipeline_stage": return c.stage_name ? `→ ${c.stage_name}` : "(sin etapa)";
    case "create_task":         return c.title ? `"${c.title}"` : "(sin título)";
    case "send_webhook":        return c.url ? c.url.replace(/^https?:\/\//, "") : "(sin URL)";
    case "notify_owner":        return "Email al vendedor asignado";
    default:                    return "";
  }
}

// ── Flow context (shared callbacks between nodes/edges and builder) ────────────
interface FlowActions {
  onInsertStep: (index: number) => void;
  onSelectNode: (id: string | null) => void;
  onDeleteStep: (id: string) => void;
  selectedId: string | null;
  triggerType: string;
  triggerConfig: Record<string, any>;
}
const FlowCtx = createContext<FlowActions>({
  onInsertStep: () => {}, onSelectNode: () => {}, onDeleteStep: () => {},
  selectedId: null, triggerType: "manual", triggerConfig: {},
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

  steps.forEach((step, i) => {
    // Use saved position, or fall back to default grid layout
    const defaultPos = { x: CX - NODE_W / 2, y: (i + 1) * V_GAP };
    const pos = positions[step.id] ?? step.position ?? defaultPos;
    nodes.push({
      id: step.id,
      type: "stepNode",
      position: pos,
      data: { step },
      selectable: true,
      draggable: true,
    });

    const src = i === 0 ? "trigger" : steps[i - 1].id;
    edges.push(makeEdge(src, step.id, i));
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
    position: { x: CX - NODE_W / 2, y: endY },
    data: {},
    selectable: false,
    draggable: false,
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
  const { selectedId, triggerType, triggerConfig } = useContext(FlowCtx);
  const isSelected = selectedId === "trigger";

  const subtitle = triggerType === "meta_lead_form"
    ? (triggerConfig?.form_name ? `📋 ${triggerConfig.form_name}` : "Sin formulario seleccionado")
    : triggerType === "tag_added" ? (triggerConfig?.tag ? `Tag: "${triggerConfig.tag}"` : "")
    : triggerType === "contact_stage_changed" ? (triggerConfig?.stage_name ? `Etapa: "${triggerConfig.stage_name}"` : "")
    : triggerType === "scheduled" ? (triggerConfig?.cron_expression ? describeCron(triggerConfig.cron_expression) : "Sin configurar")
    : null;

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
        <span className="text-sm font-semibold text-white">Trigger de inicio</span>
        {isSelected && <span className="ml-auto text-xs text-indigo-200">← config</span>}
      </div>
      <div className="px-4 py-2.5">
        <p className="text-xs font-semibold text-slate-700">{TRIGGER_LABELS[triggerType] || triggerType}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

// ── Custom: Step node ─────────────────────────────────────────────────────────
function StepNode({ data }: NodeProps) {
  const { onSelectNode, onDeleteStep, selectedId } = useContext(FlowCtx);
  const step = (data as StepNodeData).step;
  // Defensive: fall back to "wait" metadata if type is unknown
  const meta = STEP_META[step?.type] ?? STEP_META["wait"];
  const Icon = meta.icon;
  const isSelected = selectedId === step?.id;
  const summary = stepSummary(step);

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

      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}

// ── Custom: End node ──────────────────────────────────────────────────────────
function EndNode(_: NodeProps) {
  return (
    <div className="flex items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-white" style={{ width: NODE_W, height: 48 }}>
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white" />
      <span className="text-xs text-slate-400 font-medium">Fin del flujo</span>
    </div>
  );
}

// ── Custom: Addable edge (with "+" button) ────────────────────────────────────
// NOTE: EdgeLabelRenderer renders via a portal outside the FlowCtx tree, and
// React Flow's internal edge state strips function references from edge.data.
// We therefore read the callback from the module-level _onInsertStep ref,
// which AutomationBuilder keeps up-to-date on every render.
function AddableEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps) {
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
            title="Añadir paso aquí"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { triggerNode: TriggerNode, stepNode: StepNode, endNode: EndNode };
const edgeTypes = { addableEdge: AddableEdge };

// ── Step type picker dialog ───────────────────────────────────────────────────
function StepPicker({ open, onClose, onSelect }: {
  open: boolean; onClose: () => void;
  onSelect: (type: AutomationStep["type"]) => void;
}) {
  const [query, setQuery] = useState("");

  const filteredGroups = STEP_GROUPS.map(group => ({
    ...group,
    types: group.types.filter(t => {
      const meta = STEP_META[t];
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
          <span className="text-sm font-semibold">Añadir paso</span>
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
              placeholder="Buscar acción…"
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
            <p className="text-center text-sm text-muted-foreground py-8">Sin resultados para "{query}"</p>
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

function ScheduledTriggerEditor({
  triggerConfig, onChange,
}: { triggerConfig: Record<string, any>; onChange: (cfg: Record<string, any>) => void }) {
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
          Frecuencia de disparo
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
          <Label className="text-xs">Expresión cron personalizada</Label>
          <Input
            className="mt-1 font-mono text-sm"
            value={custom}
            onChange={e => handleCustom(e.target.value)}
            placeholder="0 9 * * 1"
          />
          <p className="text-xs text-muted-foreground mt-1">Formato: minuto hora díaMes mes díaSemana</p>
        </div>
      )}

      {activeExpr && (
        <div className={`rounded-lg border p-3 text-xs space-y-0.5 ${isValid ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          <p className="font-medium">{isValid ? description : description}</p>
          {isValid && (
            <p className="text-amber-600/80">
              El runner corre cada 5 minutos. Cada vez que se detecte una nueva
              hora de disparo, <strong>todos los contactos de tu organización</strong> serán
              enrolados en el flujo.
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
  const [metaForms, setMetaForms] = useState<{ form_id: string; form_name: string; page_id: string }[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [landingPages, setLandingPages] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [loadingLandings, setLoadingLandings] = useState(false);
  const [emailCampaigns, setEmailCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Load Meta forms from DB when trigger type is meta_lead_form
  useEffect(() => {
    if (triggerType !== "meta_lead_form") return;
    setLoadingForms(true);
    supabase
      .from("facebook_lead_forms")
      .select("form_id, form_name, page_id")
      .order("form_name", { ascending: true })
      .then(({ data }) => {
        setMetaForms(data || []);
        setLoadingForms(false);
      });
  }, [triggerType]);

  // Load landing pages when trigger type is landing_form_submitted
  useEffect(() => {
    if (triggerType !== "landing_form_submitted") return;
    setLoadingLandings(true);
    supabase
      .from("landing_pages")
      .select("id, name, slug")
      .eq("status", "published")
      .order("name", { ascending: true })
      .then(({ data }) => {
        setLandingPages(data || []);
        setLoadingLandings(false);
      });
  }, [triggerType]);

  // Load email campaigns when trigger is email_opened / email_clicked
  useEffect(() => {
    if (triggerType !== "email_opened" && triggerType !== "email_clicked") return;
    setLoadingCampaigns(true);
    supabase
      .from("email_campaigns")
      .select("id, name")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setEmailCampaigns(data || []);
        setLoadingCampaigns(false);
      });
  }, [triggerType]);

  return (
    <div className="space-y-4">
      <div>
        <Label>Tipo de trigger</Label>
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
              Formulario de Meta
            </Label>
            {loadingForms ? (
              <p className="text-xs text-muted-foreground mt-2">Cargando formularios...</p>
            ) : metaForms.length === 0 ? (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 space-y-1">
                <p className="font-medium">No hay formularios sincronizados</p>
                <p>Ve a <strong>Integraciones → Meta Lead Ads</strong> y sincroniza tus formularios primero.</p>
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
                  <SelectValue placeholder="Seleccionar formulario..." />
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
                Configurado correctamente
              </p>
              <p>Cuando llegue un nuevo lead del formulario <strong>"{triggerConfig.form_name}"</strong>, el contacto será enrolado automáticamente en esta automatización.</p>
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
              Landing Page
            </Label>
            {loadingLandings ? (
              <p className="text-xs text-muted-foreground mt-2">Cargando landings...</p>
            ) : landingPages.length === 0 ? (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 space-y-1">
                <p className="font-medium">No hay landings publicadas</p>
                <p>Ve a <strong>Marketing → Landings</strong> y publica una landing page primero.</p>
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
                    <SelectValue placeholder="Cualquier landing..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Cualquier landing page</SelectItem>
                    {landingPages.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="font-medium">{p.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">/{p.slug}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Deja "Cualquier landing page" para disparar desde cualquier formulario.
                </p>
              </>
            )}
          </div>
          {(triggerConfig?.page_id || landingPages.length > 0) && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700 space-y-0.5">
              <p className="font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Listo
              </p>
              <p>
                {triggerConfig?.page_id
                  ? <>Cuando alguien envíe el formulario en <strong>"{triggerConfig.page_name}"</strong>, el contacto será enrolado.</>
                  : <>Cuando alguien envíe un formulario en <strong>cualquier</strong> landing page, el contacto será enrolado.</>
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
              Campaña de email
            </Label>
            {loadingCampaigns ? (
              <p className="text-xs text-muted-foreground mt-2">Cargando campañas...</p>
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
                    <SelectValue placeholder="Cualquier campaña..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Cualquier campaña</SelectItem>
                    {emailCampaigns.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Filtra opcionalmente por campaña específica.
                </p>
              </>
            )}
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700 space-y-0.5">
            <p className="font-medium flex items-center gap-1">
              <Info className="h-3.5 w-3.5" />
              Solo se dispara una vez por contacto
            </p>
            <p>
              {triggerType === "email_opened"
                ? "Se activa la primera vez que el contacto abre el email."
                : "Se activa la primera vez que el contacto hace click en un enlace del email."
              }
            </p>
          </div>
        </div>
      )}

      {/* ── Other trigger configs ── */}
      {triggerType === "tag_added" && (
        <div>
          <Label>Tag disparador</Label>
          <Input
            className="mt-1"
            value={triggerConfig?.tag ?? ""}
            onChange={e => onChange(triggerType, { ...triggerConfig, tag: e.target.value })}
            placeholder="nuevo-lead"
          />
        </div>
      )}
      {triggerType === "contact_stage_changed" && (
        <div className="space-y-2">
          <Label>Etapa disparadora (opcional)</Label>
          <Input
            className="mt-1"
            value={triggerConfig?.stage_name ?? ""}
            onChange={e => onChange(triggerType, { ...triggerConfig, stage_name: e.target.value })}
            placeholder="Deja vacío para cualquier etapa"
          />
          <p className="text-xs text-muted-foreground">
            Se activa cuando un lead es movido a esta etapa en el pipeline. Deja vacío para disparar en cualquier cambio de etapa.
          </p>
        </div>
      )}
      {triggerType === "scheduled" && (
        <ScheduledTriggerEditor triggerConfig={triggerConfig} onChange={cfg => onChange("scheduled", cfg)} />
      )}
    </div>
  );
}

// ── Node config panel ─────────────────────────────────────────────────────────
function NodeConfigPanel({
  selectedId, steps, triggerType, triggerConfig,
  onClose, onStepChange, onTriggerChange,
}: {
  selectedId: string;
  steps: AutomationStep[];
  triggerType: string;
  triggerConfig: Record<string, any>;
  onClose: () => void;
  onStepChange: (step: AutomationStep) => void;
  onTriggerChange: (type: string, config: Record<string, any>) => void;
}) {
  const step = steps.find(s => s.id === selectedId) || null;
  const isTrigger = selectedId === "trigger";

  return (
    <div className="flex h-full flex-col">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          {isTrigger
            ? <><Zap className="h-4 w-4 text-indigo-500" /><span className="text-sm font-semibold">Trigger</span></>
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
          <TriggerConfigEditor
            triggerType={triggerType}
            triggerConfig={triggerConfig}
            onChange={onTriggerChange}
          />
        )}

        {step && <StepConfigEditor step={step} onChange={onStepChange} />}
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
function WhatsAppStepEditor({ step, onChange }: {
  step: AutomationStep;
  onChange: (updated: AutomationStep) => void;
}) {
  const c = step.config;

  const [templates, setTemplates] = useState<{ id: string; name: string; language: string; status: string; body_text: string }[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(false);

  useEffect(() => {
    setLoadingTpl(true);
    supabase
      .from("whatsapp_templates")
      .select("id, name, language, status, body_text")
      .order("name", { ascending: true })
      .then(({ data }) => { setTemplates(data || []); setLoadingTpl(false); });
  }, []);

  const selectedTpl = templates.find(
    t => t.name === c.template_name && t.language === (c.language || t.language),
  );

  const varCount = selectedTpl ? countTemplateVars(selectedTpl.body_text) : 0;
  const variables: string[] = c.variables ?? [];

  const handleSelectTemplate = (value: string) => {
    const [name, language] = value.split("||");
    // Resetear variables al cambiar de plantilla
    onChange({ ...step, config: { ...c, template_name: name, language, variables: [] } });
  };

  const setVar = (idx: number, val: string) => {
    const next = [...variables];
    next[idx] = val;
    onChange({ ...step, config: { ...c, variables: next } });
  };

  const approvedTemplates = templates.filter(t => ["APPROVED", "approved"].includes(t.status));
  const displayTemplates = approvedTemplates.length > 0 ? approvedTemplates : templates;

  return (
    <div className="space-y-4">
      {/* ── Selector de plantilla ── */}
      <div>
        <Label className="text-xs font-semibold">Plantilla de WhatsApp</Label>
        {loadingTpl ? (
          <p className="text-xs text-muted-foreground mt-1">Cargando plantillas...</p>
        ) : displayTemplates.length === 0 ? (
          <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 space-y-1">
            <p className="font-medium">No hay plantillas disponibles</p>
            <p>Ve a <strong>WA Plantillas</strong> y crea o sincroniza tus plantillas primero.</p>
          </div>
        ) : (
          <Select
            value={c.template_name && c.language ? `${c.template_name}||${c.language}` : ""}
            onValueChange={handleSelectTemplate}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Seleccionar plantilla..." />
            </SelectTrigger>
            <SelectContent>
              {displayTemplates.map(t => (
                <SelectItem key={`${t.name}||${t.language}`} value={`${t.name}||${t.language}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-muted-foreground text-xs">{t.language}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      ["APPROVED", "approved"].includes(t.status)
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {t.status}
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
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Vista previa</p>
          <HighlightedBody body={selectedTpl.body_text} variables={variables} />
        </div>
      )}

      {/* ── Mapper de variables ── */}
      {selectedTpl && varCount > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold">Variables del mensaje</Label>
          <p className="text-xs text-muted-foreground -mt-1">
            Asigna qué campo del contacto reemplazará cada variable.
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
                  <SelectValue placeholder="Seleccionar campo..." />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_FIELDS.map(f => (
                    <SelectItem key={f.value} value={f.value} className="text-xs">
                      <span className="font-medium">{f.label}</span>
                      <span className="text-muted-foreground ml-2">{f.value}</span>
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__" className="text-xs italic">
                    Texto personalizado...
                  </SelectItem>
                </SelectContent>
              </Select>
              {/* Si eligió texto personalizado, mostrar input libre */}
              {variables[i] === "__custom__" && (
                <Input
                  className="h-8 text-xs"
                  placeholder="Escribe el texto"
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
          Esta plantilla no tiene variables — se enviará tal cual.
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
        <Label className="text-xs font-semibold">Modo de asignación</Label>
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="specific">
              <div className="flex flex-col">
                <span className="font-medium">Vendedor específico</span>
                <span className="text-xs text-muted-foreground">Siempre asigna al mismo vendedor</span>
              </div>
            </SelectItem>
            <SelectItem value="round_robin">
              <div className="flex flex-col">
                <span className="font-medium">Round Robin</span>
                <span className="text-xs text-muted-foreground">Rota equitativamente entre varios vendedores</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Specific mode */}
      {mode === "specific" && (
        <div>
          <Label className="text-xs">Vendedor</Label>
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
                : <SelectValue placeholder="Selecciona un vendedor..." />}
            </SelectTrigger>
            <SelectContent>
              {loading
                ? <div className="px-3 py-2 text-xs text-muted-foreground">Cargando vendedores...</div>
                : profiles.length === 0
                  ? <div className="px-3 py-2 text-xs text-muted-foreground">Sin vendedores en la organización</div>
                  : profiles.map(p => (
                      <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>
                    ))
              }
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1.5">El lead siempre se asignará a este vendedor.</p>
        </div>
      )}

      {/* Round Robin mode */}
      {mode === "round_robin" && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold">Vendedores en rotación</Label>
          <p className="text-xs text-muted-foreground">
            Se asignará al vendedor con menos leads asignados recientemente.
          </p>
          <div className="rounded-lg border divide-y">
            {loading && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Cargando vendedores...</p>
            )}
            {!loading && profiles.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Sin vendedores en la organización</p>
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
              Selecciona al menos un vendedor
            </p>
          )}
          {ownerIds.length > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
              Rotación entre {ownerIds.length} vendedor{ownerIds.length !== 1 ? "es" : ""}:&nbsp;
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
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const c = step.config;

  useEffect(() => {
    supabase.from("pipelines").select("id, name").order("name").then(({ data }) => setPipelines(data || []));
  }, []);

  useEffect(() => {
    if (!c.pipeline_id) return;
    supabase.from("pipeline_stages").select("id, name").eq("pipeline_id", c.pipeline_id).order("position").then(({ data }) => setStages(data || []));
  }, [c.pipeline_id]);

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Pipeline</Label>
        <Select value={c.pipeline_id ?? ""} onValueChange={v => onChange({ ...step, config: { ...c, pipeline_id: v, stage_id: "", stage_name: "" } })}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar pipeline..." /></SelectTrigger>
          <SelectContent>{pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {c.pipeline_id && (
        <div>
          <Label className="text-xs">Etapa destino</Label>
          <Select value={c.stage_id ?? ""} onValueChange={v => {
            const stage = stages.find(s => s.id === v);
            onChange({ ...step, config: { ...c, stage_id: v, stage_name: stage?.name ?? "" } });
          }}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar etapa..." /></SelectTrigger>
            <SelectContent>{stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Mueve al contacto a esta etapa del pipeline. Solo funciona si el contacto ya tiene un pipeline asignado.</p>
    </div>
  );
}

// ── Email step editor (with template picker) ──────────────────────────────────
function EmailStepEditor({ step, onChange }: {
  step: AutomationStep;
  onChange: (updated: AutomationStep) => void;
}) {
  const c = step.config;
  const set = (key: string, val: any) => onChange({ ...step, config: { ...c, [key]: val } });

  const [templates, setTemplates] = useState<{ id: string; name: string; subject: string; html: string }[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    setLoadingTpl(true);
    supabase
      .from("email_templates")
      .select("id, name, subject, html")
      .order("name", { ascending: true })
      .then(({ data }) => { setTemplates(data || []); setLoadingTpl(false); });
  }, []);

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
          <Label className="text-xs">Nombre remitente</Label>
          <Input value={c.from_name ?? ""} onChange={e => set("from_name", e.target.value)} placeholder="Mi Empresa" />
        </div>
        <div>
          <Label className="text-xs">Email remitente</Label>
          <Input value={c.from_email ?? ""} onChange={e => set("from_email", e.target.value)} placeholder="hola@empresa.com" />
        </div>
      </div>

      {/* ── Asunto ── */}
      <div>
        <Label className="text-xs">Asunto</Label>
        <Input
          value={c.subject ?? ""}
          onChange={e => set("subject", e.target.value)}
          placeholder="Hola {{contact.first_name}}"
        />
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Variables: <code>{"{{contact.first_name}}"}</code> <code>{"{{contact.last_name}}"}</code>
        </p>
      </div>

      {/* ── Template picker / content ── */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 text-blue-500" />
          Contenido del email
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
                  {previewOpen ? "Ocultar" : "Vista previa"}
                </button>
                <button
                  onClick={detachTemplate}
                  className="text-xs text-slate-500 hover:text-red-500 px-2 py-0.5 rounded hover:bg-red-50 transition-colors"
                >
                  Cambiar
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
                title="Vista previa del email"
              />
            )}
            {!previewOpen && (
              <p className="text-xs text-blue-600 px-3 py-2">
                Haz clic en "Vista previa" para ver el diseño del email.
              </p>
            )}
          </div>
        ) : (
          /* No template — show picker + manual textarea */
          <>
            {loadingTpl ? (
              <p className="text-xs text-muted-foreground">Cargando plantillas...</p>
            ) : templates.length > 0 ? (
              <Select value="" onValueChange={handleSelectTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Usar plantilla del Email Builder..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="font-medium">{t.name}</span>
                      {t.subject && <span className="text-muted-foreground ml-2 text-xs">— {t.subject}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                <p className="font-medium">No hay plantillas</p>
                <p>Ve a <strong>Marketing → Email Builder</strong> para crear una.</p>
              </div>
            )}

            <div>
              <Label className="text-xs text-muted-foreground">O escribe el HTML manualmente</Label>
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
  const c = step.config;
  const set = (key: string, val: any) => onChange({ ...step, config: { ...c, [key]: val } });

  // Flatten to find the selected field definition
  const allFields = UPDATE_CONTACT_FIELDS.flatMap(g => g.fields);
  const fieldDef = allFields.find(f => f.value === c.field);

  return (
    <div className="space-y-3">
      {/* Field selector */}
      <div>
        <Label className="text-xs font-semibold">Campo a actualizar</Label>
        <Select value={c.field ?? ""} onValueChange={v => set("field", v)}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Seleccionar campo..." />
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
          <Label className="text-xs font-semibold">Nuevo valor</Label>
          {fieldDef.type === "select" && (
            <Select value={c.value ?? ""} onValueChange={v => set("value", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                {fieldDef.options!.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {fieldDef.type === "text" && (
            <Input className="mt-1" value={c.value ?? ""} onChange={e => set("value", e.target.value)}
              placeholder={`Nuevo ${fieldDef.label.toLowerCase()}`} />
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
                placeholder={`Escribe las ${fieldDef.label.toLowerCase()}...`} />
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Variables: <code>{"{{contact.first_name}}"}</code> <code>{"{{contact.last_name}}"}</code>
              </p>
            </>
          )}
        </div>
      )}

      {!c.field && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Selecciona un campo para configurar el valor.
        </p>
      )}
    </div>
  );
}

// ── Step config fields ────────────────────────────────────────────────────────
function StepConfigEditor({ step, onChange }: {
  step: AutomationStep;
  onChange: (updated: AutomationStep) => void;
}) {
  const c = step.config;
  const set = (key: string, val: any) => onChange({ ...step, config: { ...c, [key]: val } });

  if (step.type === "wait") return (
    <div>
      <Label>Duración de la espera</Label>
      <div className="flex gap-2 mt-1">
        <Input type="number" min={1} value={c.delay_value ?? 1} onChange={e => set("delay_value", Number(e.target.value))} className="w-24" />
        <Select value={c.delay_unit ?? "days"} onValueChange={v => set("delay_unit", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="minutes">Minutos</SelectItem>
            <SelectItem value="hours">Horas</SelectItem>
            <SelectItem value="days">Días</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  if (step.type === "send_email") return <EmailStepEditor step={step} onChange={onChange} />;

  if (step.type === "send_whatsapp") return <WhatsAppStepEditor step={step} onChange={onChange} />;

  if (step.type === "add_tag") return (
    <div>
      <Label>Tag a añadir</Label>
      <Input className="mt-1" value={c.tag ?? ""} onChange={e => set("tag", e.target.value)} placeholder="cliente-vip" />
    </div>
  );

  if (step.type === "update_contact") return <UpdateContactEditor step={step} onChange={onChange} />;

  if (step.type === "assign_owner") return (
    <AssignOwnerStepEditor step={step} onChange={onChange} />
  );

  if (step.type === "remove_tag") return (
    <div>
      <Label>Tag a eliminar</Label>
      <Input className="mt-1" value={c.tag ?? ""} onChange={e => set("tag", e.target.value)} placeholder="ej: prospecto-frio" />
    </div>
  );

  if (step.type === "move_pipeline_stage") return (
    <MovePipelineStepEditor step={step} onChange={onChange} />
  );

  if (step.type === "create_task") return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Título de la tarea</Label>
        <Input className="mt-1" value={c.title ?? ""} onChange={e => set("title", e.target.value)} placeholder="Llamar a {{contact.name}}" />
      </div>
      <div>
        <Label className="text-xs">Vence en (días)</Label>
        <Input type="number" min={0} className="mt-1" value={c.due_in_days ?? 1} onChange={e => set("due_in_days", parseInt(e.target.value) || 1)} />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="assign_owner_task" checked={c.assign_to_owner ?? true} onChange={e => set("assign_to_owner", e.target.checked)} />
        <Label htmlFor="assign_owner_task" className="text-xs cursor-pointer">Asignar al vendedor del contacto</Label>
      </div>
    </div>
  );

  if (step.type === "send_webhook") return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">URL del webhook</Label>
        <Input className="mt-1 font-mono text-xs" value={c.url ?? ""} onChange={e => set("url", e.target.value)} placeholder="https://n8n.tudominio.com/webhook/xyz" />
        <p className="text-[11px] text-muted-foreground mt-1">Compatible con n8n, Zapier, Make, o cualquier endpoint HTTP.</p>
      </div>
      <div>
        <Label className="text-xs">Método HTTP</Label>
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
        <Label htmlFor="include_contact" className="text-xs cursor-pointer">Incluir datos del contacto en el payload</Label>
      </div>
    </div>
  );

  if (step.type === "notify_owner") return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Mensaje de notificación</Label>
        <Textarea className="mt-1" rows={3} value={c.message ?? ""} onChange={e => set("message", e.target.value)} placeholder="Nuevo evento: {{contact.name}} completó una acción." />
        <p className="text-[11px] text-muted-foreground mt-1">Se envía por email al vendedor asignado al contacto.</p>
      </div>
    </div>
  );

  if (step.type === "condition") return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Campo</Label>
          <Select value={c.field ?? "tags"} onValueChange={v => set("field", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tags">Tags</SelectItem>
              <SelectItem value="primary_email">Email</SelectItem>
              <SelectItem value="lead_status">Estado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Operador</Label>
          <Select value={c.operator ?? "contains"} onValueChange={v => set("operator", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="contains">Contiene</SelectItem>
              <SelectItem value="equals">Es igual</SelectItem>
              <SelectItem value="not_empty">No vacío</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Valor</Label>
          <Input value={c.value ?? ""} onChange={e => set("value", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Pasos a omitir si se cumple (true)</Label>
          <Input type="number" min={0} className="mt-1"
            value={c.true_next_index !== undefined ? c.true_next_index : 0}
            onChange={e => set("true_next_index", parseInt(e.target.value) || 0)}
            placeholder="0 = siguiente paso" />
        </div>
        <div>
          <Label className="text-xs">Pasos a omitir si NO se cumple (false)</Label>
          <Input type="number" min={1} className="mt-1"
            value={c.false_skip_count ?? 1}
            onChange={e => set("false_skip_count", parseInt(e.target.value) || 1)}
            placeholder="1 = saltar 1 paso" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground flex items-start gap-1">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        Si se cumple, salta N pasos hacia adelante (0 = siguiente). Si no se cumple, omite N pasos (por defecto 1).
      </p>
    </div>
  );

  return null;
}

// ── Enroll Dialog ─────────────────────────────────────────────────────────────
function EnrollDialog({ automationId, open, onClose }: { automationId: string; open: boolean; onClose: () => void }) {
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
      toast({ title: `${data.enrolled} contacto(s) enrolados` });
      setSelected(new Set()); onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setEnrolling(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader><DialogTitle>Enrolar contactos</DialogTitle></DialogHeader>
        <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="shrink-0" />
        <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0">
          {loading && <p className="text-sm text-center text-muted-foreground py-6">Cargando...</p>}
          {filtered.map(c => (
            <label key={c.id} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="accent-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.first_name} {c.last_name}</p>
                <p className="text-xs text-muted-foreground truncate">{c.primary_email || "Sin email"}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between pt-3 border-t shrink-0">
          <span className="text-sm text-muted-foreground">{selected.size} seleccionado(s)</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleEnroll} disabled={!selected.size || enrolling}>
              {enrolling ? "Enrolando..." : "Enrolar"}
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
  const { toast } = useToast();
  const { organizationId } = useOrganizationContext();

  // Editable meta
  const [name, setName] = useState(automation?.name ?? "Nueva automatización");
  const [description, setDescription] = useState(automation?.description ?? "");
  const [isActive, setIsActive] = useState(automation?.is_active ?? false);
  const [triggerType, setTriggerType] = useState(automation?.trigger_type ?? "manual");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>(automation?.trigger_config ?? {});

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);

  // Flow actions (shared via context) — also before the useEffect
  const onInsertStep = useCallback((idx: number) => {
    setInsertIndex(idx);
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
    () => ({ onInsertStep, onSelectNode, onDeleteStep, selectedId, triggerType, triggerConfig }),
    [onInsertStep, onSelectNode, onDeleteStep, selectedId, triggerType, triggerConfig]
  );

  // Handle step picker selection
  const handlePickStep = (type: AutomationStep["type"]) => {
    if (insertIndex === null) return;
    const newStep: AutomationStep = { id: genId(), type, config: defaultConfig(type) };
    setSteps(prev => {
      const next = [...prev];
      next.splice(insertIndex, 0, newStep);
      return next;
    });
    setSelectedId(newStep.id);
    setInsertIndex(null);
  };

  // Update step config
  const handleStepChange = (updated: AutomationStep) => {
    setSteps(prev => prev.map(s => s.id === updated.id ? updated : s));
  };

  // Save
  const handleSave = async () => {
    if (!name.trim()) { toast({ title: "El nombre es obligatorio", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Embed positions into steps and trigger_config so they survive a page reload
      const stepsWithPos = steps.map(s => ({
        ...s,
        position: nodePositions[s.id] ?? s.position ?? undefined,
      }));
      const triggerConfigWithPos = nodePositions["trigger"]
        ? { ...triggerConfig, _nodePos: nodePositions["trigger"] }
        : triggerConfig;

      const payload = {
        name, description, is_active: isActive,
        trigger_type: triggerType, trigger_config: triggerConfigWithPos,
        steps: stepsWithPos, user_id: user.id, updated_at: new Date().toISOString(),
      };
      let err;
      if (automation?.id) {
        ({ error: err } = await supabase.from("automations").update(payload).eq("id", automation.id));
      } else {
        ({ error: err } = await supabase.from("automations").insert({ ...payload, created_at: new Date().toISOString(), ...(organizationId ? { organization_id: organizationId } : {}) }));
      }
      if (err) throw err;
      toast({ title: "Guardado ✓" });
      onSaved();
      onBack();
    } catch (e: any) {
      toast({ title: "Error al guardar", description: e.message, variant: "destructive" });
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
            placeholder="Nombre de la automatización"
          />
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <span>{isActive ? "Activa" : "Inactiva"}</span>
        </div>
        {automation?.id && (
          <Button variant="outline" size="sm" onClick={() => setEnrollOpen(true)} disabled={!isActive}>
            <Play className="h-3.5 w-3.5 mr-1.5" />Enrolar
          </Button>
        )}
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {saving ? "Guardando..." : "Guardar"}
        </Button>
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
                  Haz clic en <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-indigo-400 text-indigo-500 font-bold">+</span> para añadir pasos
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
              triggerType={triggerType}
              triggerConfig={triggerConfig}
              onClose={() => setSelectedId(null)}
              onStepChange={handleStepChange}
              onTriggerChange={(t, c) => { setTriggerType(t); setTriggerConfig(c); }}
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
}: {
  automation: Automation;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onEnroll: () => void;
}) {
  const stepColors = (automation.steps || []).slice(0, 6);

  return (
    <div className="group rounded-xl border bg-card hover:shadow-md transition-all">
      <div className="flex items-center gap-4 p-4">
        {/* Active toggle */}
        <Switch checked={automation.is_active} onCheckedChange={onToggle} className="shrink-0" />

        {/* Info */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{automation.name}</h3>
            <Badge variant="secondary" className={automation.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}>
              {automation.is_active ? "Activa" : "Inactiva"}
            </Badge>
            <Badge variant="outline" className="text-xs">{TRIGGER_LABELS[automation.trigger_type] || automation.trigger_type}</Badge>
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
              {!automation.steps?.length && <span className="text-xs text-muted-foreground">Sin pasos</span>}
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />{automation._enrollment_count || 0} enrolamientos
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={onEnroll} disabled={!automation.is_active} title={!automation.is_active ? "Activa para enrolar" : undefined}>
            <Play className="h-3.5 w-3.5 mr-1" />Enrolar
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit className="h-3.5 w-3.5 mr-1" />Editar
          </Button>
          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-8 w-8" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AutomationsPage() {
  const { toast } = useToast();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "builder">("list");
  const [editTarget, setEditTarget] = useState<Automation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null);
  const [enrollTarget, setEnrollTarget] = useState<Automation | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("automations").select("*").order("created_at", { ascending: false });
    const ids = (data || []).map((a: Automation) => a.id);
    let countMap: Record<string, number> = {};
    if (ids.length) {
      const { data: counts } = await supabase.from("automation_enrollments").select("automation_id").in("automation_id", ids);
      (counts || []).forEach((r: any) => { countMap[r.automation_id] = (countMap[r.automation_id] || 0) + 1; });
    }
    setAutomations((data || []).map((a: Automation) => ({ ...a, _enrollment_count: countMap[a.id] || 0 })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("automations").delete().eq("id", deleteTarget.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Eliminada" });
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
              <h1 className="text-xl font-bold">Automatizaciones</h1>
            </div>
            <Button onClick={() => { setEditTarget(null); setView("builder"); }}>
              <Plus className="h-4 w-4 mr-2" />Nueva automatización
            </Button>
          </div>


          {/* List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {loading && <div className="flex h-32 items-center justify-center text-muted-foreground"><p>Cargando...</p></div>}
            {!loading && automations.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
                  <Zap className="h-8 w-8 text-indigo-400" />
                </div>
                <p className="text-muted-foreground text-sm">No hay automatizaciones. Crea la primera.</p>
                <Button onClick={() => { setEditTarget(null); setView("builder"); }}>
                  <Plus className="h-4 w-4 mr-2" />Nueva automatización
                </Button>
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
              />
            ))}
          </div>

          {/* Enroll dialog */}
          {enrollTarget && (
            <EnrollDialog automationId={enrollTarget.id} open={!!enrollTarget} onClose={() => setEnrollTarget(null)} />
          )}

          {/* Delete confirm */}
          <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar automatización?</AlertDialogTitle>
                <AlertDialogDescription>Se eliminará "{deleteTarget?.name}" y todos sus enrolamientos permanentemente.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </AppLayout>
  );
}
