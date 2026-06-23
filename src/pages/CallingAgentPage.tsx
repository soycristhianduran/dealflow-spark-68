// ══════════════════════════════════════════════════════════════════════
//  CallingAgentPage — AI Calling Agent (Agentes, Campañas, Llamadas)
// ══════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { useWorkspace } from "@/hooks/useWorkspace";

import {
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneMissed,
  Bot,
  Plus,
  Trash2,
  Edit,
  Play,
  Pause,
  ChevronRight,
  Mic,
  Clock,
  Flame,
  Thermometer,
  Snowflake,
  Activity,
  BarChart3,
  Users,
  X,
  Check,
  Search,
  Settings,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CallingAgent {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  voice: string;
  voice_provider: string;
  language: string;
  first_message: string | null;
  system_prompt: string | null;
  objectives: string[];
  questions: { id: string; text: string; field_key: string }[];
  is_active: boolean;
  created_at: string;
}

interface CallingCampaign {
  id: string;
  organization_id: string;
  name: string;
  calling_agent_id: string;
  contact_ids: string[];
  status: "draft" | "active" | "paused" | "completed";
  total_contacts: number;
  calls_initiated: number;
  calls_answered: number;
  calls_completed: number;
  calls_failed: number;
  created_at: string;
  calling_agents?: { name: string } | null;
}

interface CallLog {
  id: string;
  organization_id: string;
  contact_id: string | null;
  campaign_id: string | null;
  calling_agent_id: string | null;
  vapi_call_id: string | null;
  status: string;
  phone_number: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
  ai_summary: string | null;
  temperature: string | null;
  interest_level: string | null;
  sentiment: string | null;
  next_step: string | null;
  analysis: Record<string, any> | null;
  started_at: string | null;
  ended_at: string | null;
  analyzed_at: string | null;
  created_at: string;
  contacts?: { first_name: string | null; last_name: string | null; primary_phone: string | null } | null;
}

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// OpenAI TTS voices (built-in, no extra cost)
const OPENAI_VOICE_OPTIONS = [
  { value: "Paola",     label: "Paola — femenina natural (es)" },
  { value: "Isabella",  label: "Isabella — femenina suave (es)" },
  { value: "Valentina", label: "Valentina — femenina cálida (es)" },
  { value: "David",     label: "David — masculino (en)" },
  { value: "Brian",     label: "Brian — masculino grave (en)" },
];

// ElevenLabs curated Spanish voices (users can also paste any custom ID)
const ELEVENLABS_VOICE_PRESETS = [
  { value: "cgSgspJ2msm6clMCkdW9", label: "Jessica — femenina, castellano" },
  { value: "EXAVITQu4vr4xnSDxMaL", label: "Bella — femenina, cálida" },
  { value: "onwK4e9ZLuTAKqWW03F9", label: "Daniel — masculino, profesional" },
  { value: "N2lVS1w4EtoT3dr4eOWO", label: "Callum — masculino, serio" },
  { value: "custom", label: "✏️ Pegar ID personalizado..." },
];

const VOICE_PROVIDER_OPTIONS = [
  { value: "openai",      label: "OpenAI TTS (incluido)" },
  { value: "elevenlabs",  label: "ElevenLabs (requiere API key en Vapi)" },
];

const LANGUAGE_OPTIONS = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
];

const OBJECTIVE_OPTIONS = [
  { value: "Calificar lead", label: "Calificar lead" },
  { value: "Agendar reunión", label: "Agendar reunión" },
  { value: "Seguimiento", label: "Seguimiento" },
  { value: "Encuesta", label: "Encuesta" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function contactName(log: CallLog): string {
  if (log.contacts) {
    const name = [log.contacts.first_name, log.contacts.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (name) return name;
  }
  return log.phone_number ?? "Desconocido";
}

// ── Badge components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const map: Record<string, { label: string; className: string }> = {
    completed:   { label: t("callingAgentPage.statusCompleted"),   className: "bg-green-100 text-green-700 border-green-200" },
    in_progress: { label: t("callingAgentPage.statusInProgress"),     className: "bg-blue-100 text-blue-700 border-blue-200" },
    no_answer:   { label: t("callingAgentPage.statusNoAnswer"),className: "bg-slate-100 text-slate-600 border-slate-200" },
    failed:      { label: t("callingAgentPage.statusFailed"),      className: "bg-red-100 text-red-700 border-red-200" },
    initiated:   { label: t("callingAgentPage.statusInitiated"),     className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
    draft:       { label: t("callingAgentPage.statusDraft"),     className: "bg-slate-100 text-slate-600 border-slate-200" },
    active:      { label: t("callingAgentPage.statusActive"),       className: "bg-green-100 text-green-700 border-green-200" },
    paused:      { label: t("callingAgentPage.statusPaused"),      className: "bg-amber-100 text-amber-700 border-amber-200" },
  };
  const cfg = map[status] ?? { label: status, className: "bg-slate-100 text-slate-600 border-slate-200" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function TemperatureBadge({ temp }: { temp: string | null }) {
  if (!temp) return <span className="text-slate-400 text-xs">—</span>;
  if (temp === "hot")  return <span className="inline-flex items-center gap-1 text-red-500 text-xs font-medium"><Flame className="h-3 w-3" />Hot</span>;
  if (temp === "warm") return <span className="inline-flex items-center gap-1 text-amber-500 text-xs font-medium"><Thermometer className="h-3 w-3" />Warm</span>;
  if (temp === "cold") return <span className="inline-flex items-center gap-1 text-blue-400 text-xs font-medium"><Snowflake className="h-3 w-3" />Cold</span>;
  return <span className="text-xs text-slate-500">{temp}</span>;
}

function InterestBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-slate-400 text-xs">—</span>;
  const map: Record<string, string> = {
    alto:   "text-green-600 bg-green-50 border-green-200",
    medio:  "text-amber-600 bg-amber-50 border-amber-200",
    bajo:   "text-slate-500 bg-slate-50 border-slate-200",
    high:   "text-green-600 bg-green-50 border-green-200",
    medium: "text-amber-600 bg-amber-50 border-amber-200",
    low:    "text-slate-500 bg-slate-50 border-slate-200",
  };
  const cls = map[level.toLowerCase()] ?? "text-slate-500 bg-slate-50 border-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {level}
    </span>
  );
}

// ── Agent Form Dialog ─────────────────────────────────────────────────────────

interface AgentFormData {
  name: string;
  description: string;
  voice: string;
  voice_provider: string;
  language: string;
  first_message: string;
  system_prompt: string;
  objectives: string[];
  questions: { id: string; text: string; field_key: string }[];
}

const emptyAgentForm = (): AgentFormData => ({
  name: "",
  description: "",
  voice: "Paola",
  voice_provider: "openai",
  language: "es",
  first_message: "",
  system_prompt: "",
  objectives: [],
  questions: [],
});

/** Sanitize a field_key: lowercase, underscored, no special chars */
function sanitizeFieldKey(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function AgentFormDialog({
  open,
  agent,
  onClose,
  onSaved,
}: {
  open: boolean;
  agent: CallingAgent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { organizationId } = useOrganizationContext();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [form, setForm] = useState<AgentFormData>(emptyAgentForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (agent) {
      setForm({
        name: agent.name,
        description: agent.description ?? "",
        voice: agent.voice,
        voice_provider: (agent as any).voice_provider ?? "openai",
        language: agent.language,
        first_message: agent.first_message ?? "",
        system_prompt: agent.system_prompt ?? "",
        objectives: agent.objectives ?? [],
        questions: (agent.questions as any[] ?? []).map((q: any) => ({
          id: q.id ?? Math.random().toString(36).slice(2),
          text: q.text ?? "",
          field_key: q.field_key ?? "",
        })),
      });
    } else {
      setForm(emptyAgentForm());
    }
  }, [agent, open]);

  const set = (key: keyof AgentFormData, val: any) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const toggleObjective = (obj: string) => {
    set(
      "objectives",
      form.objectives.includes(obj)
        ? form.objectives.filter(o => o !== obj)
        : [...form.objectives, obj],
    );
  };

  const addQuestion = () =>
    set("questions", [
      ...form.questions,
      { id: Math.random().toString(36).slice(2), text: "", field_key: "" },
    ]);

  const updateQuestion = (id: string, field: "text" | "field_key", value: string) =>
    set(
      "questions",
      form.questions.map(q =>
        q.id === id
          ? { ...q, [field]: field === "field_key" ? sanitizeFieldKey(value) : value }
          : q,
      ),
    );

  const removeQuestion = (id: string) =>
    set(
      "questions",
      form.questions.filter(q => q.id !== id),
    );

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: t("callingAgentPage.nameRequired"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        organization_id: organizationId,
        name: form.name.trim(),
        description: form.description || null,
        voice: form.voice,
        voice_provider: form.voice_provider,
        language: form.language,
        first_message: form.first_message || null,
        system_prompt: form.system_prompt || null,
        objectives: form.objectives,
        questions: form.questions,
      };

      if (agent) {
        const { error } = await supabase
          .from("calling_agents")
          .update(payload)
          .eq("id", agent.id);
        if (error) throw error;
        toast({ title: t("callingAgentPage.agentUpdated") });
      } else {
        const { error } = await supabase
          .from("calling_agents")
          .insert({ ...payload, is_active: true });
        if (error) throw error;
        toast({ title: t("callingAgentPage.agentCreated") });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: t("callingAgentPage.saveError"), description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-indigo-500" />
            {agent ? t("callingAgentPage.editAgent") : t("callingAgentPage.newAgentTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Name */}
          <div>
            <Label>{t("callingAgentPage.nameLabel")} <span className="text-red-500">*</span></Label>
            <Input
              className="mt-1"
              value={form.name}
              onChange={e => set("name", e.target.value)}
              placeholder={t("callingAgentPage.namePlaceholder")}
            />
          </div>

          {/* Description */}
          <div>
            <Label>{t("callingAgentPage.descriptionLabel")}</Label>
            <Input
              className="mt-1"
              value={form.description}
              onChange={e => set("description", e.target.value)}
              placeholder={t("callingAgentPage.descriptionPlaceholder")}
            />
          </div>

          {/* Voice Provider + Language */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("callingAgentPage.voiceProviderLabel")}</Label>
              <Select value={form.voice_provider} onValueChange={v => {
                set("voice_provider", v);
                // Reset voice to sensible default when switching provider
                if (v === "openai") set("voice", "Paola");
                else set("voice", ELEVENLABS_VOICE_PRESETS[0].value);
              }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VOICE_PROVIDER_OPTIONS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("callingAgentPage.languageLabel")}</Label>
              <Select value={form.language} onValueChange={v => set("language", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Voice selection — depends on provider */}
          <div>
            <Label>{t("callingAgentPage.voiceLabel")}</Label>
            {form.voice_provider === "openai" ? (
              <Select value={form.voice} onValueChange={v => set("voice", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPENAI_VOICE_OPTIONS.map(v => (
                    <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="space-y-2 mt-1">
                <Select
                  value={ELEVENLABS_VOICE_PRESETS.some(p => p.value === form.voice && p.value !== "custom") ? form.voice : "custom"}
                  onValueChange={v => { if (v !== "custom") set("voice", v); else set("voice", ""); }}
                >
                  <SelectTrigger><SelectValue placeholder={t("callingAgentPage.selectVoicePlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    {ELEVENLABS_VOICE_PRESETS.map(v => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Show custom ID input when "custom" selected or if pasted ID doesn't match presets */}
                {(!ELEVENLABS_VOICE_PRESETS.some(p => p.value === form.voice && p.value !== "custom") || form.voice === "") && (
                  <Input
                    value={form.voice}
                    onChange={e => set("voice", e.target.value.trim())}
                    placeholder={t("callingAgentPage.voiceIdPlaceholder")}
                    className="font-mono text-xs"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  {t("callingAgentPage.findMoreVoices")}{" "}
                  <a href="https://elevenlabs.io/voice-library" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    ElevenLabs Voice Library
                  </a>. {t("callingAgentPage.elevenLabsApiKeyNote")}
                </p>
              </div>
            )}
          </div>

          {/* First message */}
          <div>
            <Label>{t("callingAgentPage.firstMessageLabel")}</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-1">
              {t("callingAgentPage.firstMessageHelp")}
            </p>
            <Textarea
              rows={3}
              value={form.first_message}
              onChange={e => set("first_message", e.target.value)}
              placeholder="¡Hola! ¿Hablo con {{contact.first_name}}? Le llamo de parte de…"
            />
          </div>

          {/* System prompt */}
          <div>
            <Label>{t("callingAgentPage.systemPromptLabel")}</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-1">
              {t("callingAgentPage.systemPromptHelp")}
            </p>
            <Textarea
              rows={6}
              value={form.system_prompt}
              onChange={e => set("system_prompt", e.target.value)}
              placeholder={t("callingAgentPage.systemPromptPlaceholder")}
            />
          </div>

          {/* Objectives */}
          <div>
            <Label>{t("callingAgentPage.objectivesLabel")}</Label>
            <div className="mt-2 flex flex-wrap gap-3">
              {OBJECTIVE_OPTIONS.map(obj => (
                <label
                  key={obj.value}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <Checkbox
                    checked={form.objectives.includes(obj.value)}
                    onCheckedChange={() => toggleObjective(obj.value)}
                  />
                  <span className="text-sm">{obj.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Key questions */}
          <div>
            <Label>{t("callingAgentPage.keyQuestionsLabel")}</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              {t("callingAgentPage.keyQuestionsHelp")}
            </p>
            <div className="space-y-3">
              {form.questions.map((q, index) => (
                <div key={q.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                  {/* Question text row */}
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                      {index + 1}
                    </span>
                    <Input
                      value={q.text}
                      onChange={e => updateQuestion(q.id, "text", e.target.value)}
                      placeholder={t("callingAgentPage.questionTextPlaceholder")}
                      className="flex-1 bg-white"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-8 w-8 text-slate-400 hover:text-red-500"
                      onClick={() => removeQuestion(q.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* Field key row */}
                  <div className="flex items-center gap-2 pl-7">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{t("callingAgentPage.saveAnswerIn")}</span>
                    <div className="relative flex-1">
                      <Input
                        value={q.field_key}
                        onChange={e => updateQuestion(q.id, "field_key", e.target.value)}
                        placeholder={t("callingAgentPage.fieldKeyPlaceholder")}
                        className="h-7 text-xs font-mono bg-white pr-2"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addQuestion}
                className="mt-1"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                {t("callingAgentPage.addQuestion")}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>{t("callingAgentPage.cancel")}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("callingAgentPage.saving") : agent ? t("callingAgentPage.saveChanges") : t("callingAgentPage.createAgent")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Campaign Form Dialog ──────────────────────────────────────────────────────

function CampaignFormDialog({
  open,
  agents,
  onClose,
  onSaved,
}: {
  open: boolean;
  agents: CallingAgent[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { organizationId } = useOrganizationContext();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setAgentId("");
    setSearch("");
    setSelectedIds(new Set());
  }, [open]);

  useEffect(() => {
    if (!open || !organizationId) return;
    setLoadingContacts(true);
    supabase
      .from("contacts")
      .select("id, first_name, last_name, primary_email, primary_phone")
      .eq("organization_id", organizationId)
      .order("first_name", { ascending: true })
      .then(({ data }) => {
        setContacts(data ?? []);
        setLoadingContacts(false);
      });
  }, [open, organizationId]);

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const full = [c.first_name, c.last_name, c.primary_email, c.primary_phone]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return full.includes(search.toLowerCase());
  });

  const toggleContact = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: t("callingAgentPage.nameRequired"), variant: "destructive" });
      return;
    }
    if (!agentId) {
      toast({ title: t("callingAgentPage.selectAgent"), variant: "destructive" });
      return;
    }
    if (selectedIds.size === 0) {
      toast({ title: t("callingAgentPage.selectContact"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("calling_campaigns").insert({
        organization_id: organizationId,
        name: name.trim(),
        calling_agent_id: agentId,
        contact_ids: Array.from(selectedIds),
        status: "draft",
        total_contacts: selectedIds.size,
        calls_initiated: 0,
        calls_answered: 0,
        calls_completed: 0,
        calls_failed: 0,
      });
      if (error) throw error;
      toast({ title: t("callingAgentPage.campaignCreated") });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: t("callingAgentPage.campaignCreateError"), description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="h-5 w-5 text-indigo-500" />
            {t("callingAgentPage.newCampaignTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-1">
          {/* Name */}
          <div>
            <Label>{t("callingAgentPage.campaignNameLabel")}</Label>
            <Input
              className="mt-1"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t("callingAgentPage.campaignNamePlaceholder")}
            />
          </div>

          {/* Agent */}
          <div>
            <Label>{t("callingAgentPage.aiAgentLabel")}</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={t("callingAgentPage.selectAgentPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Contact selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>{t("callingAgentPage.contactsLabel")}</Label>
              {selectedIds.size > 0 && (
                <span className="text-xs text-indigo-600 font-medium">
                  {t("callingAgentPage.selectedCount", { count: selectedIds.size })}
                </span>
              )}
            </div>

            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t("callingAgentPage.searchByNameEmail")}
              />
            </div>

            <div className="rounded-lg border max-h-60 overflow-y-auto">
              {loadingContacts ? (
                <p className="text-center text-sm text-muted-foreground py-6">{t("callingAgentPage.loadingContacts")}</p>
              ) : filtered.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">{t("callingAgentPage.noResults")}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b sticky top-0">
                    <tr>
                      <th className="w-10 p-2 text-center">
                        <Checkbox
                          checked={selectedIds.size === filtered.length && filtered.length > 0}
                          onCheckedChange={toggleAll}
                        />
                      </th>
                      <th className="p-2 text-left font-medium text-muted-foreground">{t("callingAgentPage.colName")}</th>
                      <th className="p-2 text-left font-medium text-muted-foreground">{t("callingAgentPage.colEmail")}</th>
                      <th className="p-2 text-left font-medium text-muted-foreground">{t("callingAgentPage.colPhone")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map(c => (
                      <tr
                        key={c.id}
                        className={`cursor-pointer hover:bg-muted/30 transition-colors ${selectedIds.has(c.id) ? "bg-indigo-50" : ""}`}
                        onClick={() => toggleContact(c.id)}
                      >
                        <td className="p-2 text-center">
                          <Checkbox
                            checked={selectedIds.has(c.id)}
                            onCheckedChange={() => toggleContact(c.id)}
                            onClick={e => e.stopPropagation()}
                          />
                        </td>
                        <td className="p-2 font-medium text-slate-800">
                          {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                        </td>
                        <td className="p-2 text-slate-500">{c.primary_email ?? "—"}</td>
                        <td className="p-2 text-slate-500">{c.primary_phone ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>{t("callingAgentPage.cancel")}</Button>
          <Button onClick={handleCreate} disabled={saving || selectedIds.size === 0}>
            {saving ? t("callingAgentPage.creating") : selectedIds.size > 0 ? t("callingAgentPage.createCampaignCount", { count: selectedIds.size }) : t("callingAgentPage.createCampaign")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Call Detail Sheet ─────────────────────────────────────────────────────────

function CallDetailSheet({
  log,
  onClose,
}: {
  log: CallLog | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [reanalyzing, setReanalyzing] = useState(false);

  if (!log) return null;

  const analysis = log.analysis ?? {};

  const handleReanalyze = async () => {
    setReanalyzing(true);
    try {
      const { error } = await supabase.functions.invoke("call-analyzer", {
        body: { call_log_id: log.id },
      });
      if (error) throw error;
      toast({ title: t("callingAgentPage.analysisRequested"), description: t("callingAgentPage.crmUpdateSoon") });
    } catch (err: any) {
      toast({ title: t("callingAgentPage.error"), description: err.message, variant: "destructive" });
    } finally {
      setReanalyzing(false);
    }
  };

  return (
    <Sheet open={!!log} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="w-[600px] max-w-full flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4 text-indigo-500" />
            {t("callingAgentPage.callDetail")}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Header info */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-900 text-base">{contactName(log)}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{log.phone_number ?? t("callingAgentPage.noPhone")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(log.started_at ?? log.created_at)}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <StatusBadge status={log.status} />
                  {log.duration_seconds != null && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="h-3 w-3" />
                      {formatDuration(log.duration_seconds)}
                    </span>
                  )}
                </div>
              </div>

              {log.sentiment && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Activity className="h-3 w-3" />
                    {log.sentiment}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Summary */}
          {log.ai_summary && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bot className="h-4 w-4 text-indigo-500" />
                  {t("callingAgentPage.aiSummary")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <p className="text-sm text-slate-700 leading-relaxed">{log.ai_summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Question answers extracted by AI */}
          {analysis.question_answers &&
           typeof analysis.question_answers === "object" &&
           Object.keys(analysis.question_answers).length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-indigo-500" />
                  {t("callingAgentPage.keyQuestionAnswers")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 space-y-2">
                {Object.entries(analysis.question_answers as Record<string, string>).map(([question, answer]) => (
                  <div key={question} className="rounded-lg bg-indigo-50/60 border border-indigo-100 p-2.5">
                    <p className="text-xs font-medium text-indigo-700 mb-0.5">{question}</p>
                    <p className="text-sm text-slate-800">{answer || <span className="text-slate-400 italic">{t("callingAgentPage.noAnswer")}</span>}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Full analysis */}
          {Object.keys(analysis).length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-slate-500" />
                  {t("callingAgentPage.fullAnalysis")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {log.sentiment && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{t("callingAgentPage.sentiment")}</p>
                      <p className="text-sm text-slate-700">{log.sentiment}</p>
                    </div>
                  )}
                  {log.next_step && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{t("callingAgentPage.nextStep")}</p>
                      <p className="text-sm text-slate-700">{log.next_step}</p>
                    </div>
                  )}
                </div>

                {analysis.pain_points?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{t("callingAgentPage.painPoints")}</p>
                    <ul className="list-disc list-inside text-sm text-slate-700 space-y-0.5">
                      {(analysis.pain_points as string[]).map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                )}

                {analysis.objections?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{t("callingAgentPage.objections")}</p>
                    <ul className="list-disc list-inside text-sm text-slate-700 space-y-0.5">
                      {(analysis.objections as string[]).map((o, i) => <li key={i}>{o}</li>)}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {analysis.budget_mentioned != null && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{t("callingAgentPage.budgetMentioned")}</p>
                      <p className="text-sm text-slate-700">{analysis.budget_mentioned ? t("callingAgentPage.yes") : t("callingAgentPage.no")}</p>
                    </div>
                  )}
                  {analysis.timeline_mentioned != null && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{t("callingAgentPage.timelineMentioned")}</p>
                      <p className="text-sm text-slate-700">{analysis.timeline_mentioned ? t("callingAgentPage.yes") : t("callingAgentPage.no")}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recording */}
          {log.recording_url && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Mic className="h-4 w-4 text-slate-500" />
                  {t("callingAgentPage.recording")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <audio controls src={log.recording_url} className="w-full" />
              </CardContent>
            </Card>
          )}

          {/* Transcript */}
          {log.transcript && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Settings className="h-4 w-4 text-slate-500" />
                  {t("callingAgentPage.transcript")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="max-h-64 overflow-y-auto rounded-lg bg-slate-50 border p-3">
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                    {log.transcript}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t px-6 py-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleReanalyze}
            disabled={reanalyzing}
          >
            <Activity className="h-4 w-4 mr-2" />
            {reanalyzing ? t("callingAgentPage.analyzing") : t("callingAgentPage.updateInCrm")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Tab 1: Agentes ────────────────────────────────────────────────────────────

function AgentesTab() {
  const { organizationId } = useOrganizationContext();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [agents, setAgents] = useState<CallingAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<CallingAgent | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data } = await supabase
      .from("calling_agents")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    setAgents((data as CallingAgent[]) ?? []);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (agent: CallingAgent) => {
    const { error } = await supabase
      .from("calling_agents")
      .update({ is_active: !agent.is_active })
      .eq("id", agent.id);
    if (error) {
      toast({ title: t("callingAgentPage.error"), description: error.message, variant: "destructive" });
    } else {
      setAgents(prev =>
        prev.map(a => a.id === agent.id ? { ...a, is_active: !a.is_active } : a),
      );
    }
  };

  const deleteAgent = async (id: string) => {
    const { error } = await supabase.from("calling_agents").delete().eq("id", id);
    if (error) {
      toast({ title: t("callingAgentPage.deleteError"), description: error.message, variant: "destructive" });
    } else {
      setAgents(prev => prev.filter(a => a.id !== id));
      toast({ title: t("callingAgentPage.agentDeleted") });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("callingAgentPage.aiAgentsHeading")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("callingAgentPage.aiAgentsSubtitle")}
          </p>
        </div>
        <Button
          onClick={() => { setEditingAgent(null); setShowForm(true); }}
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("callingAgentPage.newAgent")}
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-16 gap-3">
          <Bot className="h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">{t("callingAgentPage.noAgents")}</p>
          <p className="text-xs text-muted-foreground">{t("callingAgentPage.noAgentsHint")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setEditingAgent(null); setShowForm(true); }}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {t("callingAgentPage.createFirstAgent")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(agent => (
            <Card key={agent.id} className="relative group hover:shadow-md transition-shadow">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                      <Bot className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(agent as any).voice_provider === "elevenlabs"
                          ? `🎙️ ElevenLabs · ${ELEVENLABS_VOICE_PRESETS.find(v => v.value === agent.voice)?.label?.split(" —")[0] ?? agent.voice}`
                          : OPENAI_VOICE_OPTIONS.find(v => v.value === agent.voice)?.label?.split(" —")[0] ?? agent.voice
                        }
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={agent.is_active}
                    onCheckedChange={() => toggleActive(agent)}
                    className="shrink-0"
                  />
                </div>

                {agent.description && (
                  <p className="text-xs text-slate-600 mb-3 line-clamp-2">{agent.description}</p>
                )}

                {agent.objectives?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {agent.objectives.map(obj => (
                      <span key={obj} className="rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
                        {obj}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${agent.is_active ? "text-green-600" : "text-slate-400"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${agent.is_active ? "bg-green-500" : "bg-slate-300"}`} />
                    {agent.is_active ? t("callingAgentPage.active") : t("callingAgentPage.inactive")}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => { setEditingAgent(agent); setShowForm(true); }}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => deleteAgent(agent.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AgentFormDialog
        open={showForm}
        agent={editingAgent}
        onClose={() => setShowForm(false)}
        onSaved={load}
      />
    </div>
  );
}

// ── Tab 2: Campañas ───────────────────────────────────────────────────────────

function CampañasTab() {
  const { organizationId } = useOrganizationContext();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<CallingCampaign[]>([]);
  const [agents, setAgents] = useState<CallingAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const [{ data: camps }, { data: ags }] = await Promise.all([
      supabase
        .from("calling_campaigns")
        .select("*, calling_agents(name)")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("calling_agents")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true),
    ]);
    setCampaigns((camps as CallingCampaign[]) ?? []);
    setAgents((ags as CallingAgent[]) ?? []);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const launchCampaign = async (campaign: CallingCampaign) => {
    try {
      const { data, error } = await supabase.functions.invoke("call-outbound", {
        body: { action: "launch_campaign", campaign_id: campaign.id },
      });
      if (error) throw error;

      const initiated: number = data?.initiated ?? 0;
      const errors: string[] = data?.errors ?? [];
      const skipped: number = data?.skipped ?? 0;

      if (initiated > 0) {
        toast({
          title: t("callingAgentPage.callsInitiated", { count: initiated }),
          description: skipped > 0 ? t("callingAgentPage.contactsSkippedNoPhone", { count: skipped }) : undefined,
        });
      } else if (errors.length > 0) {
        // Show the first error — usually reveals phone format, Vapi key, etc.
        toast({
          title: t("callingAgentPage.couldNotStartCall"),
          description: errors[0],
          variant: "destructive",
        });
      } else {
        toast({
          title: t("callingAgentPage.noCalls"),
          description: skipped > 0 ? t("callingAgentPage.contactsNoPhone", { count: skipped }) : t("callingAgentPage.noContactsToCall"),
          variant: "destructive",
        });
      }
      load();
    } catch (err: any) {
      toast({ title: t("callingAgentPage.launchError"), description: err.message, variant: "destructive" });
    }
  };

  const pauseCampaign = async (campaign: CallingCampaign) => {
    const { error } = await supabase
      .from("calling_campaigns")
      .update({ status: "paused" })
      .eq("id", campaign.id);
    if (error) {
      toast({ title: t("callingAgentPage.error"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("callingAgentPage.campaignPaused") });
      load();
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("callingAgentPage.campaignsHeading")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("callingAgentPage.campaignsSubtitle")}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t("callingAgentPage.newCampaign")}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-16 gap-3">
          <PhoneCall className="h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">{t("callingAgentPage.noCampaigns")}</p>
          <p className="text-xs text-muted-foreground">{t("callingAgentPage.noCampaignsHint")}</p>
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            {t("callingAgentPage.newCampaign")}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>{t("callingAgentPage.colCampaign")}</TableHead>
                <TableHead>{t("callingAgentPage.colAgent")}</TableHead>
                <TableHead>{t("callingAgentPage.colStatus")}</TableHead>
                <TableHead className="text-center">{t("callingAgentPage.colTotal")}</TableHead>
                <TableHead className="text-center">{t("callingAgentPage.colAnswered")}</TableHead>
                <TableHead className="text-center">{t("callingAgentPage.colCompleted")}</TableHead>
                <TableHead>{t("callingAgentPage.colCreated")}</TableHead>
                <TableHead className="text-right">{t("callingAgentPage.colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map(campaign => (
                <TableRow key={campaign.id} className="hover:bg-muted/20">
                  <TableCell className="font-medium text-slate-900">{campaign.name}</TableCell>
                  <TableCell className="text-slate-600">
                    {(campaign.calling_agents as any)?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={campaign.status} />
                  </TableCell>
                  <TableCell className="text-center text-sm">{campaign.total_contacts}</TableCell>
                  <TableCell className="text-center text-sm">{campaign.calls_answered}</TableCell>
                  <TableCell className="text-center text-sm">{campaign.calls_completed}</TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {new Date(campaign.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {(campaign.status === "draft" || campaign.status === "paused") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-200 hover:bg-green-50"
                          onClick={() => launchCampaign(campaign)}
                        >
                          <Play className="h-3.5 w-3.5 mr-1.5" />
                          {t("callingAgentPage.launch")}
                        </Button>
                      )}
                      {campaign.status === "active" && campaign.calls_initiated === 0 && (
                        // Active but 0 calls fired — allow retry without having to pause first
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-200 hover:bg-green-50"
                          onClick={() => launchCampaign(campaign)}
                        >
                          <Play className="h-3.5 w-3.5 mr-1.5" />
                          {t("callingAgentPage.relaunch")}
                        </Button>
                      )}
                      {campaign.status === "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-amber-600 border-amber-200 hover:bg-amber-50"
                          onClick={() => pauseCampaign(campaign)}
                        >
                          <Pause className="h-3.5 w-3.5 mr-1.5" />
                          {t("callingAgentPage.pause")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CampaignFormDialog
        open={showForm}
        agents={agents}
        onClose={() => setShowForm(false)}
        onSaved={load}
      />
    </div>
  );
}

// ── Tab 3: Llamadas ───────────────────────────────────────────────────────────

function LlamadasTab() {
  const { organizationId } = useOrganizationContext();
  const { t } = useTranslation();
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<CallLog | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    const { data } = await supabase
      .from("call_logs")
      .select("*, contacts(first_name, last_name, primary_phone)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(200);
    setLogs((data as CallLog[]) ?? []);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  // Real-time subscription
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel("call_logs_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "call_logs",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [organizationId, load]);

  const filtered = logs.filter(log => {
    if (!search) return true;
    const name = contactName(log).toLowerCase();
    const phone = (log.phone_number ?? "").toLowerCase();
    const q = search.toLowerCase();
    return name.includes(q) || phone.includes(q);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("callingAgentPage.callLogHeading")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("callingAgentPage.callLogSubtitle")}
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 w-60"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("callingAgentPage.searchByNamePhone")}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-16 gap-3">
          <Phone className="h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">
            {search ? t("callingAgentPage.noMatchingCalls") : t("callingAgentPage.noCallsLogged")}
          </p>
          <p className="text-xs text-muted-foreground">
            {search
              ? t("callingAgentPage.tryAnotherSearch")
              : t("callingAgentPage.callsWillAppear")
            }
          </p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>{t("callingAgentPage.colContact")}</TableHead>
                <TableHead>{t("callingAgentPage.colStatus")}</TableHead>
                <TableHead>{t("callingAgentPage.colDuration")}</TableHead>
                <TableHead>{t("callingAgentPage.colSummary")}</TableHead>
                <TableHead>{t("callingAgentPage.colDate")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(log => (
                <TableRow
                  key={log.id}
                  className="hover:bg-muted/20 cursor-pointer"
                  onClick={() => setSelectedLog(log)}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{contactName(log)}</p>
                      {log.phone_number && (
                        <p className="text-xs text-muted-foreground">{log.phone_number}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={log.status} />
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {formatDuration(log.duration_seconds)}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    {log.ai_summary ? (
                      <p className="text-xs text-slate-600 truncate">{log.ai_summary}</p>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleDateString("es-MX", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CallDetailSheet
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

// ── Vapi not-configured banner ────────────────────────────────────────────────
function VapiConfigBanner() {
  const { organizationId } = useOrganizationContext();
  const { path } = useWorkspace();
  const { t } = useTranslation();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from("vapi_configs")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => { if (!data) setMissing(true); });
  }, [organizationId]);

  if (!missing) return null;

  return (
    <div className="mx-6 mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-900">{t("callingAgentPage.vapiNotConfigured")}</p>
        <p className="text-xs text-amber-700 mt-0.5">
          {t("callingAgentPage.vapiNotConfiguredHint")}{" "}
        </p>
      </div>
      <a
        href={path("/integrations")}
        className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
      >
        {t("callingAgentPage.configure")}
      </a>
    </div>
  );
}

export default function CallingAgentPage() {
  const { t } = useTranslation();
  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Page header */}
        <div className="border-b bg-white px-6 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100">
              <Bot className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{t("callingAgentPage.pageTitle")}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("callingAgentPage.pageSubtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* Vapi config banner (shown when not configured) */}
        <VapiConfigBanner />

        {/* Tabs */}
        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="agentes" className="h-full flex flex-col">
            <div className="border-b bg-white px-6 shrink-0">
              <TabsList className="h-auto p-0 bg-transparent gap-0 rounded-none">
                <TabsTrigger
                  value="agentes"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium text-muted-foreground hover:text-slate-700 transition-colors"
                >
                  <Bot className="h-4 w-4 mr-2" />
                  {t("callingAgentPage.tabAgents")}
                </TabsTrigger>
                <TabsTrigger
                  value="campanas"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium text-muted-foreground hover:text-slate-700 transition-colors"
                >
                  <PhoneCall className="h-4 w-4 mr-2" />
                  {t("callingAgentPage.tabCampaigns")}
                </TabsTrigger>
                <TabsTrigger
                  value="llamadas"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-700 data-[state=active]:bg-transparent px-4 py-3 text-sm font-medium text-muted-foreground hover:text-slate-700 transition-colors"
                >
                  <Phone className="h-4 w-4 mr-2" />
                  {t("callingAgentPage.tabCalls")}
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto">
              <TabsContent value="agentes" className="m-0 p-6">
                <AgentesTab />
              </TabsContent>
              <TabsContent value="campanas" className="m-0 p-6">
                <CampañasTab />
              </TabsContent>
              <TabsContent value="llamadas" className="m-0 p-6">
                <LlamadasTab />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
