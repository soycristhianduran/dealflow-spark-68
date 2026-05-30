-- Add voice_provider column to calling_agents so agents can use ElevenLabs
-- instead of the default OpenAI TTS.
-- Values: 'openai' (default) | 'elevenlabs'
ALTER TABLE calling_agents
  ADD COLUMN IF NOT EXISTS voice_provider TEXT NOT NULL DEFAULT 'openai';
