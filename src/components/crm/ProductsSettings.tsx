/**
 * ProductsSettings — CRUD for the org's product/service catalog. The products
 * here appear in the "won" close dialog so sellers tag what was sold, feeding
 * a "top products" report on the dashboard.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationContext } from "@/context/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface Product { id: string; name: string; default_price: number | null; currency: string | null; }
const CURRENCIES = ["USD", "EUR", "COP", "MXN", "ARS", "BRL", "PEN", "CLP"];

export function ProductsSettings() {
  const { t } = useTranslation();
  const { organizationId, defaultCurrency } = useOrganizationContext();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency || "USD");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) { setProducts([]); setLoading(false); return; }
    const { data } = await supabase.from("products")
      .select("id, name, default_price, currency")
      .eq("organization_id", organizationId).eq("is_active", true).order("name");
    setProducts((data as Product[]) || []);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!name.trim() || !organizationId || saving) return;
    setSaving(true);
    const { error } = await supabase.from("products").insert({
      organization_id: organizationId,
      name: name.trim(),
      default_price: price ? Number(price) : null,
      currency: price ? currency : null,
    });
    setSaving(false);
    if (error) { toast.error(t("productsSettings.addError") + error.message); return; }
    setName(""); setPrice("");
    toast.success(t("productsSettings.added"));
    load();
  };

  const remove = async (id: string) => {
    // Soft-delete so won leads keep their reference intact
    const { error } = await supabase.from("products").update({ is_active: false }).eq("id", id);
    if (error) { toast.error(t("productsSettings.deleteError")); return; }
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" /> {t("productsSettings.title")}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">{t("productsSettings.description")}</p>
      </div>

      {/* Add form */}
      <div className="flex flex-col sm:flex-row gap-2 rounded-lg border p-3 bg-muted/20">
        <Input
          placeholder={t("productsSettings.namePlaceholder")}
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          className="flex-1"
        />
        <Input
          type="number" min="0" placeholder={t("productsSettings.pricePlaceholder")}
          value={price} onChange={e => setPrice(e.target.value)}
          className="sm:w-32"
        />
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="sm:w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={add} disabled={saving || !name.trim()} className="gap-1.5 shrink-0">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("productsSettings.add")}
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : products.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{t("productsSettings.empty")}</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {products.map(p => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{p.name}</p>
                {p.default_price != null && (
                  <p className="text-xs text-muted-foreground">{p.default_price} {p.currency}</p>
                )}
              </div>
              <button onClick={() => remove(p.id)} className="text-muted-foreground hover:text-destructive p-1.5 rounded-md hover:bg-destructive/10 transition-colors shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
