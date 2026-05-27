/**
 * Stripe product/price IDs for Klosify CRM.
 *
 * Plan prices (Starter, Pro, Business — monthly & annual) live in the
 * `plans` table in the DB. The pricing page reads them from there so a
 * price change is a one-row UPDATE without code deploy.
 *
 * One-time credit packs (IA Boost + IA Landings) are kept here as
 * constants since they don't belong in the subscriptions table.
 */

// ── IA Boost (one-time, adds AI analysis credits) ────────────────────────────

export const IA_BOOST_PACKS = [
  {
    key: "ia_boost_1000",
    label: "IA Boost +1,000 contactos",
    description: "1,000 análisis adicionales de contactos con IA",
    credits: 1000,
    priceUsd: 19,
    price_id: "price_1TZGQcRvVDvs7cXCbNiuwIUd",
  },
  {
    key: "ia_boost_5000",
    label: "IA Boost +5,000 contactos",
    description: "5,000 análisis adicionales de contactos con IA",
    credits: 5000,
    priceUsd: 49,
    price_id: "price_1TbjldRvVDvs7cXCuqHVwGyc",
  },
] as const;

export type IaBoostPackKey = typeof IA_BOOST_PACKS[number]["key"];

// ── IA Landings (one-time, adds landing page generation credits) ──────────────

export const IA_LANDINGS_PACKS = [
  {
    key: "ia_landings_5",
    label: "IA Landings +5 créditos",
    description: "5 créditos para generar landing pages con IA",
    credits: 5,
    priceUsd: 9,
    price_id: "price_1TZGPoRvVDvs7cXCzNjVpQPB",
  },
  {
    key: "ia_landings_25",
    label: "IA Landings +25 créditos",
    description: "25 créditos para generar landing pages con IA",
    credits: 25,
    priceUsd: 29,
    price_id: "price_1TZGQHRvVDvs7cXCLkDWkJXI",
  },
] as const;

export type IaLandingsPackKey = typeof IA_LANDINGS_PACKS[number]["key"];
