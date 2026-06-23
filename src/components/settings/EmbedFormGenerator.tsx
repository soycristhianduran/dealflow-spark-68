import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Code2, Copy, Loader2, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

const ALL_FIELDS: { name: string; label: string; type: string }[] = [
  { name: "first_name", label: "Nombre", type: "text" },
  { name: "last_name", label: "Apellido", type: "text" },
  { name: "primary_email", label: "Email", type: "email" },
  { name: "primary_phone", label: "Teléfono", type: "tel" },
  { name: "company_name", label: "Empresa", type: "text" },
  { name: "city", label: "Ciudad", type: "text" },
  { name: "notes", label: "Mensaje", type: "text" },
];

export function EmbedFormGenerator() {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({
    first_name: true, primary_email: true, primary_phone: true,
  });
  const [required, setRequired] = useState<Record<string, boolean>>({
    primary_email: true,
  });
  const [button, setButton] = useState(t("embedFormGenerator.defaultButton"));
  const [success, setSuccess] = useState(t("embedFormGenerator.defaultSuccess"));
  const [redirect, setRedirect] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.functions.invoke("org-invitations", { body: { action: "get_org" } })
      .then(({ data }) => setToken(data?.org?.public_form_token ?? null))
      .finally(() => setLoading(false));
  }, []);

  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/embed-form-submit`;
  const fields = ALL_FIELDS
    .filter(f => selected[f.name])
    .map(f => ({ name: f.name, label: f.label, type: f.type, required: !!required[f.name] }));

  const snippet = token ? buildSnippet(token, endpoint, fields, { button, success, redirect }) : "";

  const copy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success(t("embedFormGenerator.copiedToast"));
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Code2 className="h-4 w-4" /> {t("embedFormGenerator.title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          {t("embedFormGenerator.description")} <strong>{t("embedFormGenerator.descriptionEmphasis")}</strong>.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !token ? (
          <p className="text-sm text-muted-foreground">{t("embedFormGenerator.tokenError")}</p>
        ) : (
          <>
            {/* Field selection */}
            <div>
              <Label className="text-xs">{t("embedFormGenerator.formFields")}</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {ALL_FIELDS.map(f => (
                  <div key={f.name} className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={!!selected[f.name]}
                        onChange={e => setSelected(s => ({ ...s, [f.name]: e.target.checked }))} />
                      {t(`embedFormGenerator.field_${f.name}`)}
                    </label>
                    {selected[f.name] && (
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                        <input type="checkbox" checked={!!required[f.name]}
                          onChange={e => setRequired(r => ({ ...r, [f.name]: e.target.checked }))} />
                        {t("embedFormGenerator.requiredShort")}
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t("embedFormGenerator.buttonText")}</Label>
                <Input className="mt-1" value={button} onChange={e => setButton(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{t("embedFormGenerator.redirectLabel")}</Label>
                <Input className="mt-1" placeholder={t("embedFormGenerator.redirectPlaceholder")} value={redirect} onChange={e => setRedirect(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t("embedFormGenerator.successMessageLabel")}</Label>
              <Input className="mt-1" value={success} onChange={e => setSuccess(e.target.value)} />
            </div>

            {/* Snippet */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs">{t("embedFormGenerator.snippetLabel")}</Label>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={copy}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? t("embedFormGenerator.copied") : t("embedFormGenerator.copy")}
                </Button>
              </div>
              <textarea
                readOnly
                value={snippet}
                onClick={e => (e.target as HTMLTextAreaElement).select()}
                className="w-full h-44 rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed resize-none"
              />
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              ⚠️ {t("embedFormGenerator.securityNote")}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function buildSnippet(
  token: string,
  endpoint: string,
  fields: { name: string; label: string; type: string; required: boolean }[],
  opts: { button: string; success: string; redirect: string },
): string {
  return `<!-- Klosify Lead Form -->
<div id="klosify-form"></div>
<script>
(function(){
  var TOKEN=${JSON.stringify(token)};
  var ENDPOINT=${JSON.stringify(endpoint)};
  var FIELDS=${JSON.stringify(fields)};
  var SUCCESS=${JSON.stringify(opts.success)};
  var BTN=${JSON.stringify(opts.button)};
  var REDIRECT=${JSON.stringify(opts.redirect || "")};
  var UTM=['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'];
  try{var sp=new URLSearchParams(location.search);UTM.forEach(function(k){var v=sp.get(k);if(v){try{localStorage.setItem('kl_'+k,v)}catch(e){}}})}catch(e){}
  function utm(k){try{var v=new URLSearchParams(location.search).get(k);if(v)return v}catch(e){}try{return localStorage.getItem('kl_'+k)||''}catch(e){return ''}}
  var root=document.getElementById('klosify-form');if(!root)return;
  var f=document.createElement('form');
  f.style.cssText='max-width:420px;font-family:-apple-system,Segoe UI,sans-serif;display:flex;flex-direction:column;gap:10px';
  FIELDS.forEach(function(fl){
    var i=document.createElement('input');
    i.name=fl.name;i.type=fl.type||'text';i.placeholder=fl.label+(fl.required?' *':'');
    if(fl.required)i.required=true;
    i.style.cssText='padding:11px 13px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;width:100%;box-sizing:border-box';
    f.appendChild(i);
  });
  var b=document.createElement('button');b.type='submit';b.textContent=BTN;
  b.style.cssText='padding:12px;background:#f97316;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:15px';
  f.appendChild(b);
  var msg=document.createElement('div');msg.style.cssText='font-size:13px';f.appendChild(msg);
  root.appendChild(f);
  f.addEventListener('submit',function(e){
    e.preventDefault();b.disabled=true;b.textContent='Enviando...';
    var data={token:TOKEN,source:location.href};
    UTM.forEach(function(k){var v=utm(k);if(v)data[k]=v});
    new FormData(f).forEach(function(v,k){if(k)data[k]=v});
    fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
    .then(function(r){return r.json()}).then(function(res){
      if(res&&res.success){if(REDIRECT){location.href=REDIRECT}else{f.innerHTML='<p style="color:#16a34a;font-weight:700;font-size:16px">'+SUCCESS+'</p>'}}
      else{throw new Error((res&&res.error)||'error')}
    }).catch(function(){b.disabled=false;b.textContent=BTN;msg.style.color='#dc2626';msg.textContent='No se pudo enviar. Intenta de nuevo.'});
  });
})();
</script>`;
}
