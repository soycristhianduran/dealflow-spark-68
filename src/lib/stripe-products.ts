/**
 * Stripe product/price IDs used by Velocity CRM.
 *
 * Plan prices (Starter, Pro, Business — monthly & annual) live in the
 * `plans` table in the DB. The pricing page reads them from there so a
 * price change is a one-row UPDATE without code deploy.
 *
 * AI Boost packs are one-time payments and don't fit the `plans` table
 * cleanly, so we keep them as constants here.
 */

export const AI_BOOST_PRICES = {
  boost_100:  "price_1TZGPoRvVDvs7cXCzNjVpQPB",
  boost_500:  "price_1TZGQHRvVDvs7cXCLkDWkJXI",
  boost_2000: "price_1TZGQcRvVDvs7cXCbNiuwIUd",
} as const;

export type AiBoostPack = keyof typeof AI_BOOST_PRICES;

export const AI_BOOST_PACKS: Array<{
  id: AiBoostPack;
  label: string;
  credits: number;
  priceUsd: number;
  price_id: string;
}> = [
  {
    id: "boost_100",
    label: "AI Boost +100",
    credits: 100,
    priceUsd: 9,
    price_id: AI_BOOST_PRICES.boost_100,
  },
  {
    id: "boost_500",
    label: "AI Boost +500",
    credits: 500,
    priceUsd: 29,
    price_id: AI_BOOST_PRICES.boost_500,
  },
  {
    id: "boost_2000",
    label: "AI Boost +2,000",
    credits: 2000,
    priceUsd: 79,
    price_id: AI_BOOST_PRICES.boost_2000,
  },
];
