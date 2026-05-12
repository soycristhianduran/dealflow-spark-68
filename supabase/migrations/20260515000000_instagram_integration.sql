-- Instagram integration tables
-- Stores connected IG accounts, DM conversations & messages, and comments on posts.
-- IG access is via a Facebook Page that owns the IG Business/Creator account.

-- ===== Instagram accounts ====================================================
-- One row per IG Business account a CRM user has connected.
CREATE TABLE IF NOT EXISTS instagram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- IG identifiers
  ig_user_id TEXT NOT NULL,            -- Instagram Business Account ID
  ig_username TEXT,                    -- @handle (display)
  profile_picture_url TEXT,

  -- Linked Facebook page (Instagram is accessed via a Page token)
  page_id TEXT NOT NULL,
  page_name TEXT,
  page_access_token TEXT NOT NULL,     -- long-lived page token

  is_active BOOLEAN DEFAULT TRUE,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (user_id, ig_user_id)
);

CREATE INDEX IF NOT EXISTS idx_instagram_accounts_user_id ON instagram_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_ig_user_id ON instagram_accounts(ig_user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_page_id ON instagram_accounts(page_id);

-- ===== Instagram conversations (DM threads) ==================================
CREATE TABLE IF NOT EXISTS instagram_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ig_account_id UUID NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- The other party (IG user) in the conversation
  participant_id TEXT NOT NULL,        -- IGSID — Instagram-Scoped ID of the user
  participant_username TEXT,           -- if available
  participant_name TEXT,
  participant_profile_pic TEXT,

  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_preview TEXT,
  unread_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (user_id, ig_account_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_ig_conversations_user_id ON instagram_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ig_conversations_account ON instagram_conversations(ig_account_id);
CREATE INDEX IF NOT EXISTS idx_ig_conversations_participant ON instagram_conversations(participant_id);
CREATE INDEX IF NOT EXISTS idx_ig_conversations_last_msg ON instagram_conversations(last_message_at DESC);

-- ===== Instagram messages ====================================================
CREATE TABLE IF NOT EXISTS instagram_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES instagram_conversations(id) ON DELETE CASCADE,
  ig_account_id UUID NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,

  -- Meta message identifiers
  ig_message_id TEXT,                  -- Meta's mid for the message (nullable for outgoing placeholders)
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),

  -- Content
  message_type TEXT NOT NULL DEFAULT 'text',  -- text | image | video | audio | sticker | reaction | story_reply | etc
  message_text TEXT,
  attachment_url TEXT,                 -- if media, URL to the file
  story_id TEXT,                       -- if it's a story reply

  -- Sender / recipient (IGSIDs)
  sender_id TEXT,
  recipient_id TEXT,

  -- Status
  status TEXT DEFAULT 'sent',          -- sent | delivered | read | failed
  error_details TEXT,

  sent_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (ig_message_id)
);

CREATE INDEX IF NOT EXISTS idx_ig_messages_user_id ON instagram_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_ig_messages_conversation ON instagram_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ig_messages_account ON instagram_messages(ig_account_id);
CREATE INDEX IF NOT EXISTS idx_ig_messages_sent_at ON instagram_messages(sent_at DESC);

-- ===== Instagram comments ====================================================
-- One row per public comment on a post owned by a connected IG account.
-- Used for comment-to-DM automation and lead capture.
CREATE TABLE IF NOT EXISTS instagram_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ig_account_id UUID NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  comment_id TEXT NOT NULL UNIQUE,     -- Meta comment ID
  parent_comment_id TEXT,              -- if it's a reply to another comment
  media_id TEXT NOT NULL,              -- post/reel ID

  -- Commenter
  commenter_id TEXT NOT NULL,
  commenter_username TEXT,

  -- Content
  text TEXT,

  -- Automation flags
  is_replied BOOLEAN DEFAULT FALSE,
  is_dm_sent BOOLEAN DEFAULT FALSE,
  matched_automation_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ig_comments_user_id ON instagram_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_ig_comments_account ON instagram_comments(ig_account_id);
CREATE INDEX IF NOT EXISTS idx_ig_comments_media ON instagram_comments(media_id);
CREATE INDEX IF NOT EXISTS idx_ig_comments_commenter ON instagram_comments(commenter_id);
CREATE INDEX IF NOT EXISTS idx_ig_comments_created ON instagram_comments(created_at DESC);

-- ===== Instagram comment automations =========================================
-- Rules for comment-to-DM automation (ManyChat-style).
CREATE TABLE IF NOT EXISTS instagram_comment_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ig_account_id UUID NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,

  -- Trigger
  media_id TEXT,                       -- specific post (null = all posts)
  keywords TEXT[],                     -- match if comment contains ANY of these (case-insensitive)
  match_mode TEXT DEFAULT 'any' CHECK (match_mode IN ('any', 'all', 'exact')),

  -- Conditions
  require_follower BOOLEAN DEFAULT FALSE,

  -- Actions
  reply_to_comment_text TEXT,          -- public reply on the comment ({{username}} supported)
  dm_message_text TEXT,                -- private DM to send ({{username}} supported)
  dm_buttons JSONB,                    -- optional quick-reply buttons

  -- Stats
  trigger_count INT DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ig_automations_user_id ON instagram_comment_automations(user_id);
CREATE INDEX IF NOT EXISTS idx_ig_automations_account ON instagram_comment_automations(ig_account_id);
CREATE INDEX IF NOT EXISTS idx_ig_automations_active ON instagram_comment_automations(is_active) WHERE is_active = TRUE;

-- ===== RLS policies ==========================================================
ALTER TABLE instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_comment_automations ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own rows
CREATE POLICY ig_accounts_own ON instagram_accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY ig_conversations_own ON instagram_conversations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY ig_messages_own ON instagram_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY ig_comments_own ON instagram_comments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY ig_automations_own ON instagram_comment_automations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
