ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS content_blocks jsonb;
