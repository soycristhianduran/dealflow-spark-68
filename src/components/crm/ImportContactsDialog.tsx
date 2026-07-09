import { useRef, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, ArrowRight, ArrowLeft, X } from "lucide-react";
import { TagPicker } from "@/components/TagPicker";
import { Badge } from "@/components/ui/badge";
import { ImportLoader } from "@/components/crm/ImportLoader";
import { useTranslation } from "react-i18next";

// CRM fields a CSV column can map to.
const FIELDS: { value: string; labelKey: string }[] = [
  { value: "_ignore", labelKey: "fieldIgnore" },
  { value: "first_name", labelKey: "fieldFirstName" },
  { value: "last_name", labelKey: "fieldLastName" },
  { value: "full_name", labelKey: "fieldFullName" },
  { value: "primary_email", labelKey: "fieldEmail" },
  { value: "primary_phone", labelKey: "fieldPhone" },
  { value: "company_name", labelKey: "fieldCompany" },
  { value: "city", labelKey: "fieldCity" },
  { value: "country", labelKey: "fieldCountry" },
  { value: "source", labelKey: "fieldSource" },
  { value: "notes", labelKey: "fieldNotes" },
  { value: "birthday", labelKey: "fieldBirthday" },
  { value: "tags", labelKey: "fieldTags" },
  { value: "budget", labelKey: "fieldBudget" },
];

const ALIASES: Record<string, string[]> = {
  first_name: ["first name", "nombre", "first", "firstname", "nombres"],
  last_name: ["last name", "apellido", "last", "lastname", "apellidos"],
  full_name: ["full name", "nombre completo", "name", "nombre y apellido"],
  primary_email: ["email", "correo", "e-mail", "mail", "correo electronico", "correo electrónico"],
  primary_phone: ["phone", "telefono", "teléfono", "celular", "whatsapp", "movil", "móvil", "tel", "número"],
  company_name: ["company", "empresa", "compania", "compañia", "compañía", "negocio"],
  city: ["city", "ciudad"],
  country: ["country", "pais", "país"],
  source: ["source", "origen", "fuente"],
  notes: ["notes", "notas", "nota", "mensaje", "comentario", "comentarios"],
  birthday: ["birthday", "cumpleaños", "cumpleanos", "nacimiento", "fecha nacimiento", "fecha de nacimiento"],
  tags: ["tags", "etiquetas", "etiqueta"],
  budget: ["presupuesto", "budget", "monto", "valor", "importe", "sale", "venta"],
};

// "B/. 709", "$1,234.56", "1.234,56" → 709 / 1234.56 / 1234.56
function parseBudget(raw: string): number | null {
  let s = raw.replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Both present: the LAST one is the decimal separator
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // Only commas: decimal if 1-2 trailing digits, thousands otherwise
    const frac = s.length - lastComma - 1;
    s = (frac === 1 || frac === 2) ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function autoMap(header: string): string {
  const h = header.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(ALIASES)) {
    if (aliases.some(a => h === a || h.includes(a))) return field;
  }
  return "_ignore";
}

// Robust CSV parser: handles quoted fields with commas, quotes and newlines.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* skip CR */ }
      else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter(r => r.some(x => x.trim() !== ""));
}

// Parse CSV or Excel (.xlsx/.xls) into a 2D array of strings.
async function parseFile(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx"); // lazy-loaded — keeps it out of the main bundle
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" }) as unknown[][];
    return aoa.map(r => r.map(c => String(c ?? "").trim())).filter(r => r.some(x => x !== ""));
  }
  const text = await file.text();
  return parseCSV(text);
}

export function ImportContactsDialog({ open, onOpenChange, onImported }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}) {
  const { t } = useTranslation();
  const { organizationId } = useOrganizationContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "map" | "done">("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; total: number; duplicates: number } | null>(null);
  // Background import progress (the loader can be closed while it keeps running).
  const [progress, setProgress] = useState<{ done: number; total: number; finished: boolean; created: number; updated: number } | null>(null);

  // Destination: pipeline / stage / owner for the imported leads.
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; name: string; pipeline_id: string }[]>([]);
  const [members, setMembers] = useState<{ user_id: string; name: string }[]>([]);
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  // Tags applied to EVERY imported lead (in addition to any tag column).
  const [importTags, setImportTags] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !organizationId) return;
    supabase.from("pipelines").select("id, name").eq("organization_id", organizationId).order("created_at")
      .then(({ data }) => { setPipelines(data || []); if (data?.[0] && !pipelineId) setPipelineId(data[0].id); });
    supabase.from("pipeline_stages").select("id, name, pipeline_id").eq("organization_id", organizationId).order("order")
      .then(({ data }) => setStages(data || []));
    supabase.functions.invoke("org-invitations", { body: { action: "list_members", organization_id: organizationId } })
      .then(({ data }) => {
        const list = (data?.members as { user_id: string; full_name?: string; email?: string }[] | undefined) || [];
        setMembers(list.map(m => ({ user_id: m.user_id, name: m.full_name || m.email || "Sin nombre" })));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId]);

  // Default the stage to the first stage of the selected pipeline.
  const pipelineStages = stages.filter(s => s.pipeline_id === pipelineId);
  useEffect(() => {
    if (pipelineStages.length && !pipelineStages.some(s => s.id === stageId)) setStageId(pipelineStages[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId, stages]);

  const reset = () => {
    setStep("upload"); setHeaders([]); setRows([]); setMapping({});
    setResult(null); setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    try {
      const parsed = await parseFile(file);
      if (parsed.length < 2) { toast.error(t("importContactsDialog.errNotEnoughData")); return; }
      const hdr = parsed[0].map(h => h.trim());
      setHeaders(hdr);
      setRows(parsed.slice(1));
      const m: Record<number, string> = {};
      hdr.forEach((h, i) => { m[i] = autoMap(h); });
      setMapping(m);
      setStep("map");
    } catch (_) {
      toast.error(t("importContactsDialog.errReadFile"));
    }
  };

  const mappedFields = Object.values(mapping);
  const hasEmailOrPhone = mappedFields.includes("primary_email") || mappedFields.includes("primary_phone");

  const handleImport = async () => {
    if (!organizationId) { toast.error(t("importContactsDialog.errNoOrganization")); return; }
    setImporting(true);
    try {
      // Build contact objects from rows using the column mapping.
      const contacts = rows.map(row => {
        const c: Record<string, any> = { organization_id: organizationId, status: "new" };
        headers.forEach((_, i) => {
          const field = mapping[i];
          if (!field || field === "_ignore") return;
          const val = (row[i] ?? "").trim();
          if (!val) return;
          if (field === "tags") c.tags = val.split(/[;,]/).map(x => x.trim()).filter(Boolean);
          else if (field === "budget") {
            const n = parseBudget(val);
            if (n !== null) c.budget = n;
          }
          else c[field] = val;
        });
        if (!c.full_name) {
          c.full_name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.primary_email || c.primary_phone || "Sin nombre";
        }
        if (!c.source) c.source = "Importación CSV";
        return c;
      }).filter(c => c.primary_email || c.primary_phone);

      // De-duplicate WITHIN the file (same email or phone appearing multiple
      // times) so we don't create duplicate contacts. Keep the first occurrence.
      const seenKeys = new Set<string>();
      let inFileDupes = 0;
      const dedupedContacts = contacts.filter((c: any) => {
        const k = (c.primary_email && "e:" + c.primary_email.toLowerCase())
          || (c.primary_phone && "p:" + c.primary_phone) || "";
        if (k && seenKeys.has(k)) { inFileDupes++; return false; }
        if (k) seenKeys.add(k);
        return true;
      });
      const rawContactCount = contacts.length;
      // From here on, work with the deduped list.
      contacts.length = 0;
      contacts.push(...dedupedContacts);

      // Dedup against existing contacts (by email or phone) in this org.
      const emails = contacts.map(c => c.primary_email).filter(Boolean);
      const phones = contacts.map(c => c.primary_phone).filter(Boolean);
      const existing = new Map<string, { id: string; tags: string[] }>(); // key -> {id, current tags}
      const chunk = <T,>(arr: T[], n: number) => arr.reduce((a: T[][], _, i) => (i % n ? a : [...a, arr.slice(i, i + n)]), []);
      for (const part of chunk(emails, 200)) {
        const { data } = await supabase.from("contacts").select("id, primary_email, tags")
          .eq("organization_id", organizationId).in("primary_email", part);
        (data || []).forEach((d: any) => d.primary_email && existing.set("e:" + d.primary_email.toLowerCase(), { id: d.id, tags: d.tags || [] }));
      }
      for (const part of chunk(phones, 200)) {
        const { data } = await supabase.from("contacts").select("id, primary_phone, tags")
          .eq("organization_id", organizationId).in("primary_phone", part);
        (data || []).forEach((d: any) => d.primary_phone && existing.set("p:" + d.primary_phone, { id: d.id, tags: d.tags || [] }));
      }

      const uniq = (arr: string[]) => {
        const seen = new Set<string>(); const out: string[] = [];
        for (const t of arr) { const k = t.trim(); if (k && !seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); out.push(k); } }
        return out;
      };

      const toInsert: any[] = [];
      const toUpdate: { id: string; patch: any }[] = [];
      for (const c of contacts) {
        const match = (c.primary_email && existing.get("e:" + c.primary_email.toLowerCase()))
          || (c.primary_phone && existing.get("p:" + c.primary_phone));
        // Tags from the file column + the "tags for all" chosen in the UI.
        const fileTags = (c.tags as string[] | undefined) || [];
        if (match) {
          // Existing contact: merge tags (keep its current ones), don't move pipeline.
          const { organization_id, status, ...patch } = c;
          patch.tags = uniq([...(match.tags || []), ...fileTags, ...importTags]);
          toUpdate.push({ id: match.id, patch });
        } else {
          // New contact: drop it into the chosen pipeline/stage/owner + tags.
          toInsert.push({
            ...c,
            tags: uniq([...fileTags, ...importTags]),
            lead_status: "active",
            ...(pipelineId ? { pipeline_id: pipelineId } : {}),
            ...(stageId ? { stage_id: stageId } : {}),
            ...(ownerId ? { owner_id: ownerId } : {}),
          });
        }
      }

      // Sync all tags (file + chosen) into the org's central catalog.
      const allTags = [...new Set([...contacts.flatMap((c: any) => (c.tags as string[] | undefined) || []), ...importTags])];
      if (allTags.length) {
        await supabase.from("organization_tags")
          .upsert(allTags.map(name => ({ organization_id: organizationId, name })), { onConflict: "organization_id,name" });
      }

      // Show the background loader and switch the dialog out of the blocking
      // spinner; the import continues even if the user closes the loader.
      const totalOps = toInsert.length + toUpdate.length;
      let processed = 0;
      setProgress({ done: 0, total: totalOps, finished: false, created: 0, updated: 0 });
      onOpenChange(false); // close the modal — only the background loader shows now

      let created = 0;
      for (const part of chunk(toInsert, 200)) {
        const { data, error } = await supabase.from("contacts").insert(part).select("id");
        if (error) throw error;
        created += data?.length ?? 0;
        processed += part.length;
        setProgress(p => p ? { ...p, done: processed, created } : p);
      }
      // Update existing contacts in PARALLEL batches (was one-by-one, which took
      // minutes for thousands of existing contacts). 25 concurrent per batch.
      let updated = 0;
      for (const batch of chunk(toUpdate, 25)) {
        const results = await Promise.all(
          batch.map(u => supabase.from("contacts").update(u.patch).eq("id", u.id).then(({ error }) => !error))
        );
        updated += results.filter(Boolean).length;
        processed += batch.length;
        setProgress(p => p ? { ...p, done: processed, updated } : p);
      }

      setProgress({ done: totalOps, total: totalOps, finished: true, created, updated });
      toast.success(t("importContactsDialog.importCompletedToast", { created, updated }));

      setResult({
        created, updated,
        total: rows.length,
        skipped: rows.length - rawContactCount, // rows with no email/phone
        duplicates: inFileDupes,                // same contact repeated in the file
      });
      setStep("done");
      onImported?.();
    } catch (e: any) {
      toast.error(e.message || t("importContactsDialog.errImport"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
    {/* Background import loader — stays even if the dialog closes (the import
        keeps running in the browser; a toast fires when it finishes). */}
    {progress && (
      <ImportLoader
        done={progress.done}
        total={progress.total}
        finished={progress.finished}
        created={progress.created}
        updated={progress.updated}
        onClose={() => { setProgress(null); onOpenChange(false); reset(); }}
      />
    )}
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v && !progress) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> {t("importContactsDialog.title")}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("importContactsDialog.uploadIntro")}
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-2 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">{t("importContactsDialog.uploadButton")}</span>
              <span className="text-xs text-muted-foreground">.csv · .xlsx · .xls</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <p className="text-xs text-muted-foreground">
              {t("importContactsDialog.uploadTip")}
            </p>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            {/* Destination for the imported leads */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground">{t("importContactsDialog.leadsDestination")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">{t("importContactsDialog.pipelineLabel")}</Label>
                  <Select value={pipelineId} onValueChange={setPipelineId}>
                    <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder={t("importContactsDialog.pipelinePlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("importContactsDialog.stageLabel")}</Label>
                  <Select value={stageId} onValueChange={setStageId} disabled={!pipelineStages.length}>
                    <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder={t("importContactsDialog.stagePlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {pipelineStages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("importContactsDialog.ownerLabel")}</Label>
                  <Select value={ownerId || "_none"} onValueChange={(v) => setOwnerId(v === "_none" ? "" : v)}>
                    <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder={t("importContactsDialog.ownerPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">{t("importContactsDialog.ownerUnassigned")}</SelectItem>
                      {members.map(m => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tags applied to every imported lead */}
              <div>
                <Label className="text-xs">{t("importContactsDialog.tagsForAllLabel")}</Label>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {importTags.map(tag => (
                    <Badge key={tag} variant="secondary" className="gap-1 py-1">
                      {tag}
                      <button onClick={() => setImportTags(importTags.filter(x => x !== tag))}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                  <div className="w-[200px]">
                    <TagPicker
                      value=""
                      placeholder={t("importContactsDialog.addTagPlaceholder")}
                      onChange={(t) => { if (t && !importTags.includes(t)) setImportTags([...importTags, t]); }}
                    />
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">{t("importContactsDialog.destinationNote")}</p>
            </div>

            <p className="text-sm text-muted-foreground">
              {t("importContactsDialog.rowsDetected", { count: rows.length })}
            </p>
            <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{h || t("importContactsDialog.columnFallback", { number: i + 1 })}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {t("importContactsDialog.examplePrefix", { value: rows[0]?.[i] || "—" })}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select value={mapping[i] ?? "_ignore"} onValueChange={(v) => setMapping(m => ({ ...m, [i]: v }))}>
                    <SelectTrigger className="w-48 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{t(`importContactsDialog.${f.labelKey}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {!hasEmailOrPhone && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                {t("importContactsDialog.mapEmailOrPhoneWarning")}
              </div>
            )}
            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep("upload")} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> {t("importContactsDialog.back")}
              </Button>
              <Button onClick={handleImport} disabled={importing || !hasEmailOrPhone} className="gap-2">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {t("importContactsDialog.importButton", { count: rows.length })}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <div>
              <p className="text-lg font-semibold">{t("importContactsDialog.doneTitle")}</p>
              <div className="text-sm text-muted-foreground mt-2 space-y-0.5">
                <p><strong className="text-foreground">{result.total}</strong> {t("importContactsDialog.resultRowsRead")}</p>
                <p><strong className="text-emerald-600">{result.created}</strong> {t("importContactsDialog.resultCreated")}</p>
                <p><strong className="text-blue-600">{result.updated}</strong> {t("importContactsDialog.resultUpdated")}</p>
                {result.duplicates > 0 && <p><strong className="text-purple-600">{result.duplicates}</strong> {t("importContactsDialog.resultDuplicates")}</p>}
                {result.skipped > 0 && <p><strong className="text-amber-600">{result.skipped}</strong> {t("importContactsDialog.resultSkipped")}</p>}
              </div>
              {result.skipped > result.created + result.updated && (
                <div className="mt-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2.5 text-[11px] text-amber-800 dark:text-amber-300 text-left">
                  {t("importContactsDialog.manySkippedWarning")}
                </div>
              )}
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={reset}>{t("importContactsDialog.importAnother")}</Button>
              <Button onClick={() => { onOpenChange(false); reset(); }}>{t("importContactsDialog.close")}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
