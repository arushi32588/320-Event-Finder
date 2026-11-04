-- Run after the other migrations. Connects the verification flow end to end and
-- finishes locking down the tables the API uses:
--   1. Applications are saved to the organization_* columns the guard requires.
--   2. A rejected organizer can apply again (rejected -> pending).
--   3. Row-level security on events, saved_events and rsvps, plus the tables no
--      endpoint uses yet, so the public anon key can't read or change them.

-- 2. Same guard as before, except organizers may move rejected -> pending.
CREATE OR REPLACE FUNCTION public.guard_verification_writes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'organizer_verification_requests' AND TG_OP = 'INSERT' THEN
    IF NEW.organizer_profile_id IS NULL OR
       NULLIF(btrim(NEW.organization_name), '') IS NULL OR
       NULLIF(btrim(NEW.organization_description), '') IS NULL OR
       NULLIF(btrim(NEW.contact_email), '') IS NULL THEN
      RAISE EXCEPTION 'Profile, organization name, description, and contact email are required'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'organizer_profiles' AND TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NULL OR NULLIF(btrim(NEW.organization_name), '') IS NULL THEN
      RAISE EXCEPTION 'User and organization name are required'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF (SELECT auth.role()) = 'service_role' OR
     (SELECT auth.uid()) IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'users' THEN
    IF TG_OP = 'UPDATE' AND (
      NEW.id IS DISTINCT FROM OLD.id OR
      NEW.role IS DISTINCT FROM OLD.role OR
      NEW.email IS DISTINCT FROM OLD.email
    ) THEN
      RAISE EXCEPTION 'Only admins may change user identity, email, or role'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'organizer_profiles' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_at := now();
    END IF;
    IF TG_OP = 'UPDATE' AND NULLIF(btrim(NEW.organization_name), '') IS NULL THEN
      RAISE EXCEPTION 'Organization name is required'
        USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' THEN
      IF NEW.verification_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Only admins may set organizer verification status'
          USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id OR
          NEW.created_at IS DISTINCT FROM OLD.created_at OR
          (NEW.verification_status IS DISTINCT FROM OLD.verification_status AND
           NOT (OLD.verification_status = 'rejected' AND NEW.verification_status = 'pending')) THEN
      RAISE EXCEPTION 'Only admins may change organizer ownership, review, or creation time'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'organizer_verification_requests' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_at := now();
    END IF;
    IF TG_OP = 'UPDATE' AND (
       NULLIF(btrim(NEW.organization_name), '') IS NULL OR
       NULLIF(btrim(NEW.organization_description), '') IS NULL OR
       NULLIF(btrim(NEW.contact_email), '') IS NULL) THEN
      RAISE EXCEPTION 'Organization name, description, and contact email are required'
        USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' THEN
      IF NEW.status IS DISTINCT FROM 'pending' OR
         NEW.reviewed_by_user_id IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Only admins may set review fields'
          USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.organizer_profile_id IS DISTINCT FROM OLD.organizer_profile_id OR
          NEW.status IS DISTINCT FROM OLD.status OR
          NEW.reviewed_by_user_id IS DISTINCT FROM OLD.reviewed_by_user_id OR
          NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR
          NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Only admins may change request ownership or review fields'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 1. Submitting: same behavior as before, saved to the organization_* columns.
CREATE OR REPLACE FUNCTION public.submit_verification_request(
  p_organization_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL,
  p_document_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  organization_name TEXT,
  description TEXT,
  address TEXT,
  website TEXT,
  contact_email TEXT,
  document_url TEXT,
  status public.verification_status,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile_id BIGINT;
  v_profile_status public.verification_status;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Please log in to continue' USING ERRCODE = 'EF401';
  END IF;

  INSERT INTO public.organizer_profiles (user_id, organization_name, verification_status)
    VALUES (v_user_id, p_organization_name, 'pending')
    ON CONFLICT (user_id) DO NOTHING;

  -- FOR UPDATE makes two submissions from one user take turns.
  SELECT p.id, p.verification_status
    INTO v_profile_id, v_profile_status
    FROM public.organizer_profiles p
    WHERE p.user_id = v_user_id
    FOR UPDATE;

  IF v_profile_status = 'approved' THEN
    RAISE EXCEPTION 'Your organization is already verified' USING ERRCODE = 'EF409';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organizer_verification_requests r
    WHERE r.organizer_profile_id = v_profile_id AND r.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You already have a verification request pending review' USING ERRCODE = 'EF409';
  END IF;

  UPDATE public.organizer_profiles p
    SET organization_name = p_organization_name, verification_status = 'pending'
    WHERE p.id = v_profile_id;

  BEGIN
    RETURN QUERY
      INSERT INTO public.organizer_verification_requests AS r
        (organizer_profile_id, organization_name, organization_description, organization_address,
         website_or_social_media, contact_email, document_url, status)
        VALUES (v_profile_id, p_organization_name, p_description, p_address,
                p_website, p_contact_email, p_document_url, 'pending')
        RETURNING
          r.id,
          r.organization_name::TEXT,
          r.organization_description,
          r.organization_address,
          r.website_or_social_media,
          r.contact_email::TEXT,
          r.document_url,
          r.status,
          r.rejection_reason,
          r.created_at,
          r.reviewed_at;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'You already have a verification request pending review' USING ERRCODE = 'EF409';
  END;
END;
$$;

-- The caller's most recent request. Older rows may use the shorter column names.
CREATE OR REPLACE FUNCTION public.get_my_verification_request()
RETURNS TABLE (
  id BIGINT,
  organization_name TEXT,
  description TEXT,
  address TEXT,
  website TEXT,
  contact_email TEXT,
  document_url TEXT,
  status public.verification_status,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please log in to continue' USING ERRCODE = 'EF401';
  END IF;

  RETURN QUERY
    SELECT
      r.id,
      COALESCE(r.organization_name, p.organization_name)::TEXT,
      COALESCE(r.organization_description, r.description),
      COALESCE(r.organization_address, r.address)::TEXT,
      COALESCE(r.website_or_social_media, r.website)::TEXT,
      r.contact_email::TEXT,
      r.document_url::TEXT,
      r.status,
      r.rejection_reason,
      r.created_at,
      r.reviewed_at
    FROM public.organizer_verification_requests r
    JOIN public.organizer_profiles p ON p.id = r.organizer_profile_id
    WHERE p.user_id = auth.uid()
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT 1;
END;
$$;

-- 3. Events: everyone sees approved ones, submitters see their own, and new
-- submissions must start pending. Only admins can approve.
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_read_approved ON public.events
  FOR SELECT TO anon, authenticated USING (approval_status = 'approved');
CREATE POLICY events_read_own ON public.events
  FOR SELECT TO authenticated USING (submitted_by_user_id = (SELECT auth.uid()));
CREATE POLICY events_insert_own_pending ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by_user_id = (SELECT auth.uid())
    AND approval_status = 'pending'
    AND reviewed_by_user_id IS NULL
    AND source = 'user_submission'
    AND (organizer_profile_id IS NULL OR EXISTS (
      SELECT 1 FROM public.organizer_profiles p
      WHERE p.id = organizer_profile_id AND p.user_id = (SELECT auth.uid())
    ))
  );
CREATE POLICY events_admin_all ON public.events
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- Saved events and RSVPs belong to the user who made them.
ALTER TABLE public.saved_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_events_own ON public.saved_events
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY rsvps_own ON public.rsvps
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- No endpoint uses these yet. With no policies the anon key can't reach them;
-- the service role still can. Add policies when messaging is built.
ALTER TABLE public.event_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
