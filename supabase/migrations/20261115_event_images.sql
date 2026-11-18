INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-images', 'event-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.owns_event_folder(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::TEXT = (storage.foldername(object_name))[1]
      AND e.submitted_by_user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.owns_event_folder(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_event_folder(TEXT) TO authenticated;

CREATE POLICY event_images_read_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'event-images' AND public.owns_event_folder(name));
CREATE POLICY event_images_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-images' AND public.owns_event_folder(name));
CREATE POLICY event_images_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'event-images' AND public.owns_event_folder(name));

CREATE OR REPLACE FUNCTION public.set_event_image(p_event_id BIGINT, p_image_url TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  submitter UUID;
BEGIN
  SELECT e.submitted_by_user_id INTO submitter FROM public.events e WHERE e.id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found' USING ERRCODE = 'EF404';
  END IF;
  IF submitter IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Only the person who submitted this event can change its photo' USING ERRCODE = 'EF403';
  END IF;
  UPDATE public.events SET image_url = p_image_url WHERE id = p_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_event_image(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_event_image(BIGINT, TEXT) TO authenticated;
