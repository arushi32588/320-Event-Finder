-- Run after 20261025_event_fields_and_signup_trigger.sql. Adds what the
-- Organization Verification request endpoint needs: the application-form
-- fields, timestamps, a one-pending-request guarantee, and two functions for
-- submitting and reading a user's own request.

-- The same columns (and definitions) as 20261103_admin_verification_review.sql.
-- IF NOT EXISTS makes the two migrations safe to run in either order, or twice.
ALTER TABLE public.organizer_verification_requests
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS address VARCHAR(255),
  ADD COLUMN IF NOT EXISTS website VARCHAR(2048),
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- A profile can have only one pending request, even if two submissions race.
-- (Fails if a profile already has several pending requests; reject the extras first.)
CREATE UNIQUE INDEX IF NOT EXISTS organizer_verification_requests_one_pending_idx
  ON public.organizer_verification_requests (organizer_profile_id)
  WHERE status = 'pending';

-- Both functions run as their owner, so they work whatever row-level security
-- is on these tables, and each one only ever touches the calling user's own
-- rows (auth.uid()). Errors use custom codes (EF401, EF409) that the API turns
-- into matching HTTP statuses.

-- Submits an application: creates or updates the caller's organizer profile
-- (status pending) and adds a pending request. All of it happens or none of it
-- does. Refuses if the caller is already approved or has a pending request.
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
        (organizer_profile_id, description, address, website, contact_email, document_url, status)
        VALUES (v_profile_id, p_description, p_address, p_website, p_contact_email, p_document_url, 'pending')
        RETURNING
          r.id,
          p_organization_name,
          r.description,
          r.address::TEXT,
          r.website::TEXT,
          r.contact_email::TEXT,
          r.document_url::TEXT,
          r.status,
          r.rejection_reason,
          r.created_at,
          r.reviewed_at;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'You already have a verification request pending review' USING ERRCODE = 'EF409';
  END;
END;
$$;

-- The caller's most recent request (none if they never applied).
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
      p.organization_name::TEXT,
      r.description,
      r.address::TEXT,
      r.website::TEXT,
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

-- New functions are callable by everyone unless this is revoked. Only
-- logged-in users can reach them.
REVOKE EXECUTE ON FUNCTION public.submit_verification_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_verification_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_verification_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_verification_request() TO authenticated;
