CREATE OR REPLACE FUNCTION public.is_event_chat_member(p_event_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    LEFT JOIN public.organizer_profiles p ON p.id = e.organizer_profile_id
    WHERE e.id = p_event_id
      AND e.approval_status = 'approved'
      AND (
        p.user_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.rsvps r
          WHERE r.event_id = e.id AND r.user_id = (SELECT auth.uid()) AND r.status = 'going'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    LEFT JOIN public.organizer_profiles p ON p.id = c.organizer_profile_id
    WHERE c.id = p_conversation_id
      AND CASE c.kind
        WHEN 'group' THEN public.is_event_chat_member(c.event_id)
        ELSE c.attendee_user_id = (SELECT auth.uid()) OR p.user_id = (SELECT auth.uid())
      END
  );
$$;

DROP POLICY IF EXISTS conversations_read_members ON public.conversations;
CREATE POLICY conversations_read_members ON public.conversations
  FOR SELECT TO authenticated
  USING (public.is_conversation_member(id));

DROP POLICY IF EXISTS messages_read_members ON public.messages;
CREATE POLICY messages_read_members ON public.messages
  FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id));

CREATE OR REPLACE FUNCTION public.event_chat_messages(p_event_id BIGINT)
RETURNS TABLE (
  id BIGINT,
  sender_id UUID,
  sender_name TEXT,
  sender_is_organizer BOOLEAN,
  body TEXT,
  sent_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    m.id,
    m.sender_user_id,
    COALESCE(u.name, u.email, 'Someone')::TEXT,
    m.sender_user_id IS NOT NULL AND m.sender_user_id = p.user_id,
    m.body,
    m.created_at
  FROM public.conversations c
  JOIN public.messages m ON m.conversation_id = c.id
  JOIN public.events e ON e.id = c.event_id
  LEFT JOIN public.organizer_profiles p ON p.id = e.organizer_profile_id
  LEFT JOIN public.users u ON u.id = m.sender_user_id
  WHERE c.event_id = p_event_id
    AND c.kind = 'group'
    AND public.is_event_chat_member(p_event_id)
  ORDER BY m.created_at, m.id;
$$;

CREATE OR REPLACE FUNCTION public.last_event_chat_messages(p_event_ids BIGINT[])
RETURNS TABLE (
  event_id BIGINT,
  sender_name TEXT,
  body TEXT,
  sent_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT ON (c.event_id)
    c.event_id,
    COALESCE(u.name, u.email, 'Someone')::TEXT,
    m.body,
    m.created_at
  FROM public.conversations c
  JOIN public.messages m ON m.conversation_id = c.id
  LEFT JOIN public.users u ON u.id = m.sender_user_id
  WHERE c.event_id = ANY (p_event_ids)
    AND c.kind = 'group'
    AND public.is_event_chat_member(c.event_id)
  ORDER BY c.event_id, m.created_at DESC, m.id DESC;
$$;

CREATE OR REPLACE FUNCTION public.send_event_message(p_event_id BIGINT, p_body TEXT)
RETURNS TABLE (
  id BIGINT,
  sender_id UUID,
  sender_name TEXT,
  sender_is_organizer BOOLEAN,
  body TEXT,
  sent_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  trimmed TEXT := btrim(COALESCE(p_body, ''));
  chat_id BIGINT;
  organizer_id BIGINT;
BEGIN
  IF NOT public.is_event_chat_member(p_event_id) THEN
    RAISE EXCEPTION 'This conversation isn''t available.' USING ERRCODE = 'EF404';
  END IF;
  IF char_length(trimmed) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Message must be 1 to 2000 characters.' USING ERRCODE = 'EF400';
  END IF;

  SELECT e.organizer_profile_id INTO organizer_id FROM public.events e WHERE e.id = p_event_id;

  INSERT INTO public.conversations (event_id, organizer_profile_id, kind)
  VALUES (p_event_id, organizer_id, 'group')
  ON CONFLICT (event_id) WHERE kind = 'group' DO NOTHING;

  SELECT c.id INTO chat_id FROM public.conversations c WHERE c.event_id = p_event_id AND c.kind = 'group';

  RETURN QUERY
  WITH inserted AS (
    INSERT INTO public.messages (conversation_id, sender_user_id, body)
    VALUES (chat_id, (SELECT auth.uid()), trimmed)
    RETURNING messages.id, messages.sender_user_id, messages.body, messages.created_at
  )
  SELECT
    i.id,
    i.sender_user_id,
    COALESCE(u.name, u.email, 'Someone')::TEXT,
    p.user_id IS NOT NULL AND p.user_id = i.sender_user_id,
    i.body,
    i.created_at
  FROM inserted i
  LEFT JOIN public.users u ON u.id = i.sender_user_id
  LEFT JOIN public.organizer_profiles p ON p.id = organizer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.is_event_chat_member(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_conversation_member(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_chat_messages(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.last_event_chat_messages(BIGINT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_event_message(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_event_chat_member(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_chat_messages(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.last_event_chat_messages(BIGINT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_event_message(BIGINT, TEXT) TO authenticated;
