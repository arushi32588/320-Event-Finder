-- Run after 20261102_organizer_verification_access.sql, which provides
-- public.is_admin(). Adds what the Admin Dashboard needs: the rejection reason
-- and two admin-only functions for listing and reviewing verification requests.

-- IF NOT EXISTS so this is safe alongside the other Sprint 4 schema migrations.
ALTER TABLE public.organizer_verification_requests
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS address VARCHAR(255),
  ADD COLUMN IF NOT EXISTS website VARCHAR(2048),
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Speeds up the dashboard's default view (pending requests, oldest first).
CREATE INDEX IF NOT EXISTS organizer_verification_requests_pending_idx
  ON public.organizer_verification_requests (created_at)
  WHERE status = 'pending';

-- Both functions run as their owner so they work whatever row-level security
-- is on these tables, which is why each one checks for an admin itself.
-- Errors use custom codes (EF403, EF404, EF409) that the API turns into
-- matching HTTP statuses.
-- Lists requests oldest first. A NULL status lists all of them. The form's
-- details can be in either set of columns, so this reads the
-- organization_* ones first and falls back to the shorter names.
CREATE OR REPLACE FUNCTION public.list_verification_requests(p_status public.verification_status DEFAULT NULL)
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
  reviewed_at TIMESTAMPTZ,
  applicant_id UUID,
  applicant_name TEXT,
  applicant_email TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = 'EF403';
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
      r.reviewed_at,
      u.id,
      u.name::TEXT,
      u.email::TEXT
    FROM public.organizer_verification_requests r
    LEFT JOIN public.organizer_profiles p ON p.id = r.organizer_profile_id
    LEFT JOIN public.users u ON u.id = p.user_id
    WHERE p_status IS NULL OR r.status = p_status
    ORDER BY r.created_at, r.id;
END;
$$;

-- Approves or rejects a pending request. All of it happens or none of it does,
-- so a request can never end up approved while its user isn't an organizer.
CREATE OR REPLACE FUNCTION public.review_verification_request(
  p_request_id BIGINT,
  p_decision public.verification_status,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  status public.verification_status,
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_profile_id BIGINT;
  v_current_status public.verification_status;
  v_applicant_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = 'EF403';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'A review must approve or reject' USING ERRCODE = '22023';
  END IF;

  -- FOR UPDATE makes two admins reviewing at once take turns, so the second
  -- one sees the request is already reviewed.
  SELECT r.organizer_profile_id, r.status
    INTO v_profile_id, v_current_status
    FROM public.organizer_verification_requests r
    WHERE r.id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification request not found' USING ERRCODE = 'EF404';
  END IF;

  IF v_current_status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been reviewed' USING ERRCODE = 'EF409';
  END IF;

  UPDATE public.organizer_profiles p
    SET verification_status = p_decision
    WHERE p.id = v_profile_id
    RETURNING p.user_id INTO v_applicant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This request has no organizer profile' USING ERRCODE = 'EF409';
  END IF;

  -- Only attendees are promoted, so approving an admin's request keeps them admin.
  IF p_decision = 'approved' THEN
    UPDATE public.users u
      SET role = 'organizer'
      WHERE u.id = v_applicant_id AND u.role = 'attendee';
  END IF;

  RETURN QUERY
    UPDATE public.organizer_verification_requests r
      SET
        status = p_decision,
        reviewed_by_user_id = auth.uid(),
        reviewed_at = now(),
        rejection_reason = CASE WHEN p_decision = 'rejected' THEN p_rejection_reason END
      WHERE r.id = p_request_id
      RETURNING r.id, r.status, r.rejection_reason, r.reviewed_at;
END;
$$;

-- New functions are callable by everyone unless this is revoked. Only logged-in
-- users can reach them, and the checks above then require an admin.
REVOKE EXECUTE ON FUNCTION public.list_verification_requests(public.verification_status) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_verification_request(BIGINT, public.verification_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_verification_requests(public.verification_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_verification_request(BIGINT, public.verification_status, TEXT) TO authenticated;
