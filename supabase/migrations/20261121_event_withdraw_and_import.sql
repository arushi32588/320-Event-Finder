-- Submitters can delete their own event until it is approved.
CREATE POLICY events_delete_own_unapproved ON public.events
  FOR DELETE TO authenticated
  USING (
    submitted_by_user_id = (SELECT auth.uid())
    AND source = 'user_submission'
    AND approval_status IN ('pending', 'rejected')
  );

-- Imported events are matched by their source link.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS external_source_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS external_source_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS events_external_source_url_key
  ON public.events (external_source_url)
  WHERE external_source_url IS NOT NULL;
