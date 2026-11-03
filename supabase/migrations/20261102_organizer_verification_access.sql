-- Organizer verification data and access rules for the profile/API flow.

ALTER TABLE public.organizer_profiles
  ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.organizer_verification_requests
  ADD COLUMN organization_name VARCHAR(255),
  ADD COLUMN organization_description TEXT,
  ADD COLUMN organization_address TEXT,
  ADD COLUMN website_or_social_media TEXT,
  ADD COLUMN contact_email VARCHAR(255),
  ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN reviewed_at TIMESTAMPTZ;

-- A link or uploaded proof's storage URL may be longer than 255 characters.
ALTER TABLE public.organizer_verification_requests
  ALTER COLUMN document_url TYPE TEXT;

-- Preserve the organization name on requests that predate this migration.
UPDATE public.organizer_verification_requests r
SET organization_name = p.organization_name
FROM public.organizer_profiles p
WHERE r.organizer_profile_id = p.id AND r.organization_name IS NULL;

-- A rejected request is no longer pending, so its organizer may apply again.
CREATE UNIQUE INDEX organizer_verification_one_pending_per_profile
  ON public.organizer_verification_requests (organizer_profile_id)
  WHERE status = 'pending';

-- The function owner can read public.users without the caller's RLS policy.
-- This avoids a recursive users policy when checking the caller's role.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- RLS selects the rows a user may touch. The triggers below protect review
-- columns: RLS alone cannot compare OLD and NEW values on an update.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_verification_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_read_own ON public.users
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY users_admin_all ON public.users
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY organizer_profiles_read_own ON public.organizer_profiles
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
-- Public event cards join approved organizer profiles for name and badge.
CREATE POLICY organizer_profiles_read_approved ON public.organizer_profiles
  FOR SELECT TO anon, authenticated USING (verification_status = 'approved');
CREATE POLICY organizer_profiles_insert_own ON public.organizer_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY organizer_profiles_update_own ON public.organizer_profiles
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY organizer_profiles_admin_all ON public.organizer_profiles
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY verification_requests_read_own ON public.organizer_verification_requests
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organizer_profiles p
    WHERE p.id = organizer_profile_id AND p.user_id = (SELECT auth.uid())
  ));
CREATE POLICY verification_requests_insert_own ON public.organizer_verification_requests
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organizer_profiles p
    WHERE p.id = organizer_profile_id AND p.user_id = (SELECT auth.uid())
  ));
CREATE POLICY verification_requests_update_own ON public.organizer_verification_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organizer_profiles p
    WHERE p.id = organizer_profile_id AND p.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organizer_profiles p
    WHERE p.id = organizer_profile_id AND p.user_id = (SELECT auth.uid())
  ));
CREATE POLICY verification_requests_admin_all ON public.organizer_verification_requests
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.guard_verification_writes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- New requests must include the required wireframe fields even when an API
  -- uses the service role. Existing legacy rows are left intact.
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

  -- Auth's internal delete cascades have no caller JWT. RLS still prevents
  -- anonymous clients from changing rows directly.
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
          NEW.verification_status IS DISTINCT FROM OLD.verification_status OR
          NEW.created_at IS DISTINCT FROM OLD.created_at THEN
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

CREATE TRIGGER users_guard_role
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_verification_writes();
CREATE TRIGGER organizer_profiles_guard_review
  BEFORE INSERT OR UPDATE ON public.organizer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_verification_writes();
CREATE TRIGGER verification_requests_guard_review
  BEFORE INSERT OR UPDATE ON public.organizer_verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_verification_writes();
