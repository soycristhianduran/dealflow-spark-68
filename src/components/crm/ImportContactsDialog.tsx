import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";

// CRM fields a CSV column can map to.
const FIELDS: { value: string; label: string }[] = [
  { value: "_ignore", label: "— Ignorar —" },
  { value: "first_name", label: "Nombre" },
  { value: "last_name", label: "Apellido" },
  { value: "full_name", label: "Nombre completo" },
  { value: "primary_email", label: "Email" },
  { value: "primary_phone", label: "Teléfono / WhatsApp" },
  { value: "company_name", label: "Empresa" },
  { value: "city", label: "Ciudad" },
  { value: "country", label: "País" },
  { value: "source", label: "Origen" },
  { value: "notes", label: "Notas" },
  { value: "birthday", label: "Cumpleaños (AAAA-MM-DD)" },
  { value: "tags", label: "Etiquetas (separadas por ;)" },
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
};

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

export function ImportContactsDialog({ open, onOpenChange, onImported }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}) {
  const { organizationId } = useOrganizationContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "map" | "done">("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);

  const reset = () => {
    setStep("upload"); setHeaders([]); setRows([]); setMapping({});
    setResult(null); setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCSV(String(reader.result || ""));
      if (parsed.length < 2) { toast.error("El archivo no tiene datos suficientes."); return; }
      const hdr = parsed[0].map(h => h.trim());
      setHeaders(hdr);
      setRows(parsed.slice(1));
      const m: Record<number, string> = {};
      hdr.forEach((h, i) => { m[i] = autoMap(h); });
      setMapping(m);
      setStep("map");
    };
    reader.readAsText(file);
  };

  const mappedFields = Object.values(mapping);
  const hasEmailOrPhone = mappedFields.includes("primary_email") || mappedFields.includes("primary_phone");

  const handleImport = async () => {
    if (!organizationId) { toast.error("No se encontró la organización."); return; }
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
          if (field === "tags") c.tags = val.split(/[;,]/).map(t => t.trim()).filter(Boolean);
          else c[field] = val;
        });
        if (!c.full_name) {
          c.full_name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.primary_email || c.primary_phone || "Sin nombre";
        }
        if (!c.source) c.source = "Importación CSV";
        return c;
      }).filter(c => c.primary_email || c.primary_phone);

      // Dedup against existing contacts (by email or phone) in this org.
      const emails = contacts.map(c => c.primary_email).filter(Boolean);
      const phones = contacts.map(c => c.primary_phone).filter(Boolean);
      const existing = new Map<string, string>(); // key -> id
      const chunk = <T,>(arr: T[], n: number) => arr.reduce((a: T[][], _, i) => (i % n ? a : [...a, arr.slice(i, i + n)]), []);
      for (const part of chunk(emails, 200)) {
        const { data } = await supabase.from("contacts").select("id, primary_email")
          .eq("organization_id", organizationId).in("primary_email", part);
        (data || []).forEach((d: any) => d.primary_email && existing.set("e:" + d.primary_email.toLowerCase(), d.id));
      }
      for (const part of chunk(phones, 200)) {
        const { data } = await supabase.from("contacts").select("id, primary_phone")
          .eq("organization_id", organizationId).in("primary_phone", part);
        (data || []).forEach((d: any) => d.primary_phone && existing.set("p:" + d.primary_phone, d.id));
      }

      const toInsert: any[] = [];
      const toUpdate: { id: string; patch: any }[] = [];
      for (const c of contacts) {
        const id = (c.primary_email && existing.get("e:" + c.primary_email.toLowerCase()))
          || (c.primary_phone && existing.get("p:" + c.primary_phone));
        if (id) {
          const { organization_id, status, ...patch } = c;
          toUpdate.push({ id, patch });
        } else {
          toInsert.push(c);
        }
      }

      let created = 0;
      for (const part of chunk(toInsert, 200)) {
        const { data, error } = await supabase.from("contacts").insert(part).select("id");
        if (error) throw error;
        created += data?.length ?? 0;
      }
      let updated = 0;
      for (const u of toUpdate) {
        const { error } = await supabase.from("contacts").update(u.patch).eq("id", u.id);
        if (!error) updated++;
      }

      setResult({ created, updated, skipped: rows.length - contacts.length });
      setStep("done");
      onImported?.();
    } catch (e: any) {
      toast.error(e.message || "Error al importar");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar contactos
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sube un archivo <strong>CSV</strong> con tus contactos. En el siguiente paso podrás
              relacionar cada columna con el campo correcto del CRM.
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-2 hover:border-primary/50 hover:bg-muted/40 transition-colors"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">Haz clic para subir un CSV</span>
              <span className="text-xs text-muted-foreground">o arrástralo aquí</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <p className="text-xs text-muted-foreground">
              Tip: la primera fila debe tener los nombres de las columnas (ej. Nombre, Email, Teléfono).
            </p>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {rows.length} fila(s) detectada(s). Relaciona cada columna de tu archivo con un campo del CRM:
            </p>
            <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{h || `Columna ${i + 1}`}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      ej. {rows[0]?.[i] || "—"}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select value={mapping[i] ?? "_ignore"} onValueChange={(v) => setMapping(m => ({ ...m, [i]: v }))}>
                    <SelectTrigger className="w-48 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {!hasEmailOrPhone && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                Debes mapear al menos <strong>Email</strong> o <strong>Teléfono</strong> para identificar a cada contacto.
              </div>
            )}
            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep("upload")} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Atrás
              </Button>
              <Button onClick={handleImport} disabled={importing || !hasEmailOrPhone} className="gap-2">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Importar {rows.length} contacto(s)
              </Button>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <div>
              <p className="text-lg font-semibold">¡Importación completada!</p>
              <div className="text-sm text-muted-foreground mt-2 space-y-0.5">
                <p><strong className="text-emerald-600">{result.created}</strong> contactos nuevos creados</p>
                <p><strong className="text-blue-600">{result.updated}</strong> contactos existentes actualizados</p>
                {result.skipped > 0 && <p><strong className="text-amber-600">{result.skipped}</strong> filas omitidas (sin email/teléfono)</p>}
              </div>
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={reset}>Importar otro archivo</Button>
              <Button onClick={() => { onOpenChange(false); reset(); }}>Cerrar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
