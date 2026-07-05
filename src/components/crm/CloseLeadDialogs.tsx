/**
 * CloseLeadDialogs — shared "won budget" and "lost reason" dialogs.
 *
 * Business rule: NO path may close a lead without its data —
 * won ⇒ confirmed/updated budget, lost ⇒ a loss reason. These dialogs are
 * reused by every surface that can change a lead's status (pipeline board,
 * card menus, lead detail, conversations stage picker, bulk actions).
 */
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trophy, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

export const LOST_REASONS = [
  "Precio muy alto",
  "Eligió a la competencia",
  "Sin presupuesto disponible",
  "No era el momento indicado",
  "Sin respuesta (ghosting)",
  "No era el cliente ideal",
  "Otra razón…",
];

const CURRENCIES = ["USD", "EUR", "COP", "MXN", "ARS", "BRL", "PEN", "CLP"];

/** Budget confirmation for closing WON. Prefills the current budget so the
 *  user confirms or updates the real closing amount. */
export function WonBudgetDialog({
  open, onOpenChange, contactName, initialAmount, initialCurrency, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName?: string | null;
  initialAmount?: number | null;
  initialCurrency?: string | null;
  onConfirm: (amount: number, currency: string) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(initialCurrency || "USD");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(initialAmount && Number(initialAmount) > 0 ? String(initialAmount) : "");
      setCurrency(initialCurrency || "USD");
    }
  }, [open, initialAmount, initialCurrency]);

  const confirm = async () => {
    const v = parseFloat(amount.replace(/,/g, "."));
    if (!v || v <= 0) return;
    setSaving(true);
    try { await onConfirm(v, currency); onOpenChange(false); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-sm z-[10000]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-green-500" /> {t("closeLeadDialogs.wonTitle")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("closeLeadDialogs.wonHelp", { name: contactName || "" })}
        </p>
        <div className="flex gap-2 items-center">
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-24 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[10001]">
              {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            autoFocus type="number" min="1" placeholder="0.00"
            value={amount} onChange={e => setAmount(e.target.value)}
            onKeyDown={e => e.key === "Enter" && confirm()}
            className="flex-1"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("closeLeadDialogs.cancel")}
          </Button>
          <Button onClick={confirm} disabled={saving || !amount} className="gap-1.5 bg-green-600 hover:bg-green-700">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("closeLeadDialogs.confirmWon")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Mandatory loss reason when closing LOST. */
export function LostReasonDialog({
  open, onOpenChange, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState("");
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setSelected(""); setCustom(""); } }, [open]);

  const reason = selected === "Otra razón…" ? custom.trim() : selected;

  const confirm = async () => {
    if (!reason) return;
    setSaving(true);
    try { await onConfirm(reason); onOpenChange(false); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-sm z-[10000]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" /> {t("closeLeadDialogs.lostTitle")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("closeLeadDialogs.lostHelp")}</p>
        <div className="space-y-2">
          {LOST_REASONS.map(r => (
            <button
              key={r} type="button"
              onClick={() => { setSelected(r); if (r !== "Otra razón…") setCustom(""); }}
              className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                selected === r
                  ? "border-destructive bg-destructive/10 text-destructive font-medium"
                  : "border-border hover:border-muted-foreground hover:bg-muted/50"
              }`}
            >
              {r}
            </button>
          ))}
          {selected === "Otra razón…" && (
            <Input autoFocus placeholder={t("closeLeadDialogs.customReasonPlaceholder")}
              value={custom} onChange={e => setCustom(e.target.value)}
              onKeyDown={e => e.key === "Enter" && confirm()} className="mt-1" />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("closeLeadDialogs.cancel")}
          </Button>
          <Button onClick={confirm} variant="destructive" disabled={saving || !reason} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("closeLeadDialogs.confirmLost")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
