-- Ad sets (one level below campaigns)
CREATE TABLE IF NOT EXISTS meta_adsets (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  adset_id        TEXT        NOT NULL,
  adset_name      TEXT        NOT NULL,
  campaign_id     TEXT        NOT NULL,
  status          TEXT,
  daily_budget    NUMERIC,
  lifetime_budget NUMERIC,
  spend           NUMERIC     DEFAULT 0,
  impressions     BIGINT      DEFAULT 0,
  clicks          BIGINT      DEFAULT 0,
  leads           INTEGER     DEFAULT 0,
  cpl             NUMERIC,
  ad_account_id   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, adset_id)
);

ALTER TABLE meta_adsets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own adsets"
  ON meta_adsets FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Individual ads with creative data
CREATE TABLE IF NOT EXISTS meta_ads (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_id           TEXT        NOT NULL,
  ad_name         TEXT        NOT NULL,
  adset_id        TEXT        NOT NULL,
  campaign_id     TEXT        NOT NULL,
  status          TEXT,
  creative_id     TEXT,
  headline        TEXT,
  body            TEXT,
  image_url       TEXT,
  call_to_action  TEXT,
  spend           NUMERIC     DEFAULT 0,
  impressions     BIGINT      DEFAULT 0,
  clicks          BIGINT      DEFAULT 0,
  leads           INTEGER     DEFAULT 0,
  cpl             NUMERIC,
  ad_account_id   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, ad_id)
);

ALTER TABLE meta_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own ads"
  ON meta_ads FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
