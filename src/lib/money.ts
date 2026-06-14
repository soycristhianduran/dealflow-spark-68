/**
 * Central money formatter — uses the browser's Intl.NumberFormat so each currency
 * renders with its correct symbol, separators and decimals (COP → $10.000.000,
 * USD → $10,000.00, etc.). Use everywhere amounts are shown so formatting stays
 * consistent across the CRM.
 */
export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined = "USD",
  opts: { compact?: boolean } = {},
): string {
  const value = Number(amount || 0);
  const cur = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
      notation: opts.compact ? "compact" : "standard",
      maximumFractionDigits: opts.compact ? 1 : undefined,
    }).format(value);
  } catch {
    // Unknown/invalid currency code → fall back to a plain number + code.
    return `${value.toLocaleString()} ${cur}`;
  }
}
