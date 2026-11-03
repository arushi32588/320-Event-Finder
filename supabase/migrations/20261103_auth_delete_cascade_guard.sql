-- Apply after 20261102_organizer_verification_access.sql on existing projects.
-- Supabase Auth's internal user deletion clears reviewed_by_user_id through
-- an ON DELETE SET NULL foreign key. That update has no caller JWT and must
-- pass the review guard; direct anonymous updates remain blocked by RLS.

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
