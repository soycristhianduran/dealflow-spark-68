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
    price_id: "price_1To6ULCFCI8hiTfkX7ePhZm9",
  },
  {
    key: "ia_boost_5000",
    label: "IA Boost +5,000 contactos",
    description: "5,000 análisis adicionales de contactos con IA",
    credits: 5000,
    priceUsd: 49,
    price_id: "price_1To6ULCFCI8hiTfkcn9CjL8M",
  },
] as const;

export type IaBoostPackKey = typeof IA_BOOST_PACKS[number]["key"];

// ── IA Landings (one-time, adds landing page generation credits) ──────────────

// Unit: 1 credit = 1.000 tokens. The Stripe prices still carry the token amount
// in metadata (the webhook adds tokens to ia_landings_credits); we just present
// the balance to the user as credits (tokens / 1.000).
export const IA_LANDINGS_PACKS = [
  {
    key: "ia_landings_500k",
    label: "IA Landings +500 créditos",
    description: "500 créditos para generar y refinar landing pages con IA",
    credits: 500000,
    priceUsd: 12,
    price_id: "price_1To6UMCFCI8hiTfkPBZLgcGo",
  },
  {
    key: "ia_landings_1m",
    label: "IA Landings +1.000 créditos",
    description: "1.000 créditos para generar y refinar landing pages con IA",
    credits: 1000000,
    priceUsd: 22,
    price_id: "price_1To6UMCFCI8hiTfkSyJZHZIt",
  },
  {
    key: "ia_landings_3m",
    label: "IA Landings +3.000 créditos",
    description: "3.000 créditos para generar y refinar landing pages con IA",
    credits: 3000000,
    priceUsd: 52,
    price_id: "price_1To6UMCFCI8hiTfkaqWJ4Jfg",
  },
] as const;

export type IaLandingsPackKey = typeof IA_LANDINGS_PACKS[number]["key"];

// ── IA Agent (one-time, adds AI Agent conversation credits) ───────────────────
// Price IDs are created by running `stripe-setup-products` edge function.
// Update these values after running that function.

// Unit: 1 credit = 1.000 tokens (input + output). A long conversation consumes
// more credits. Stripe price metadata carries `credits` (1000 / 4000).
export const IA_AGENT_PACKS = [
  {
    key: "ia_agent_200",
    label: "Agente IA +1.000 créditos",
    description: "1.000 créditos adicionales (≈1.000.000 tokens) para el Agente de Chat",
    credits: 1000,
    priceUsd: 9,
    price_id: "price_1To6UNCFCI8hiTfkqKzBZBon",
  },
  {
    key: "ia_agent_1000",
    label: "Agente IA +4.000 créditos",
    description: "4.000 créditos adicionales (≈4.000.000 tokens) para el Agente de Chat",
    credits: 4000,
    priceUsd: 29,
    price_id: "price_1To6UNCFCI8hiTfkk3cdp3rd",
  },
] as const;

export type IaAgentPackKey = typeof IA_AGENT_PACKS[number]["key"];
