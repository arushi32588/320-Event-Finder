-- Run after schema.sql. Adds what the Home, Event Details and Create Account
-- pages display but the original schema had no column for, plus a trigger that
-- creates the public.users row whenever someone signs up through Supabase Auth.

-- Event fields shown on the Home cards and Event Details page.
ALTER TABLE public.events
  ADD COLUMN description TEXT,
  ADD COLUMN end_time TIMESTAMPTZ,
  ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0), -- 0 = Free
  ADD COLUMN ages VARCHAR(100),           -- e.g. 'All ages', '18+'
  ADD COLUMN accessibility VARCHAR(255),  -- NULL = no accessibility info
  ADD COLUMN transportation VARCHAR(255), -- e.g. 'Bus / Walk / Parking'
  ADD COLUMN image_url VARCHAR(2048);

-- Speeds up the Home page query (approved events ordered by start time).
CREATE INDEX events_approved_start_time_idx
  ON public.events (start_time)
  WHERE approval_status = 'approved';

-- Create Account asks for a date of birth.
ALTER TABLE public.users
  ADD COLUMN date_of_birth DATE;

-- Copy each new auth user into public.users. The signup endpoint passes the
-- name and date of birth as user metadata, so they arrive here with the user.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, name, email, date_of_birth)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'name',
    NEW.email,
    (NEW.raw_user_meta_data ->> 'date_of_birth')::DATE
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
