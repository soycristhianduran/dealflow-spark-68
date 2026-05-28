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
    price_id: "price_1TbswhRvVDvs7cXCvm8l27mT",
  },
  {
    key: "ia_boost_5000",
    label: "IA Boost +5,000 contactos",
    description: "5,000 análisis adicionales de contactos con IA",
    credits: 5000,
    priceUsd: 49,
    price_id: "price_1TbswhRvVDvs7cXC1wTja50X",
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
    price_id: "price_1TbswgRvVDvs7cXCHxshzl0T",
  },
  {
    key: "ia_landings_25",
    label: "IA Landings +25 créditos",
    description: "25 créditos para generar landing pages con IA",
    credits: 25,
    priceUsd: 35,
    price_id: "price_1TbswgRvVDvs7cXCTEkVOtjD",
  },
] as const;

export type IaLandingsPackKey = typeof IA_LANDINGS_PACKS[number]["key"];

// ── IA Agent (one-time, adds AI Agent conversation credits) ───────────────────
// Price IDs are created by running `stripe-setup-products` edge function.
// Update these values after running that function.

export const IA_AGENT_PACKS = [
  {
    key: "ia_agent_200",
    label: "Agente IA +200 conversaciones",
    description: "200 conversaciones adicionales para el Agente IA",
    credits: 200,
    priceUsd: 9,
    price_id: "price_1TbswiRvVDvs7cXCBLbnX48I",
  },
  {
    key: "ia_agent_1000",
    label: "Agente IA +1,000 conversaciones",
    description: "1,000 conversaciones adicionales para el Agente IA",
    credits: 1000,
    priceUsd: 29,
    price_id: "price_1TbswiRvVDvs7cXCkfJQ35XY",
  },
] as const;

export type IaAgentPackKey = typeof IA_AGENT_PACKS[number]["key"];
