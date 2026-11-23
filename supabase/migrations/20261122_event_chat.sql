ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'direct';

ALTER TABLE public.conversations
  ALTER COLUMN attendee_user_id DROP NOT NULL,
  ALTER COLUMN organizer_profile_id DROP NOT NULL,
  ALTER COLUMN event_id SET NOT NULL;

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS unique_event_conversation,
  DROP CONSTRAINT IF EXISTS conversations_kind_check,
  DROP CONSTRAINT IF EXISTS conversations_members_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_kind_check CHECK (kind IN ('group', 'direct')),
  ADD CONSTRAINT conversations_members_check CHECK (
    (kind = 'group' AND attendee_user_id IS NULL)
    OR (kind = 'direct' AND attendee_user_id IS NOT NULL AND organizer_profile_id IS NOT NULL)
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_group_per_event
  ON public.conversations (event_id)
  WHERE kind = 'group';

CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_direct_per_pair
  ON public.conversations (event_id, attendee_user_id, organizer_profile_id)
  WHERE kind = 'direct';

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.messages
  ALTER COLUMN conversation_id SET NOT NULL,
  ALTER COLUMN body SET NOT NULL,
  ALTER COLUMN sender_user_id DROP NOT NULL;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_body_length_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_body_length_check CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000) NOT VALID;

CREATE INDEX IF NOT EXISTS messages_conversation_created_at_idx
  ON public.messages (conversation_id, created_at, id);
