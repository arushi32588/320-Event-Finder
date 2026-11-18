import type { SupabaseClient } from '@supabase/supabase-js';
import {
  EVENT_IMAGE_BUCKET,
  findOwnedEvent,
  removeStoredImage,
  storagePathFromUrl,
  type EventImage,
  type Failure,
} from '@/lib/event-images';

export const MAX_GALLERY_IMAGES = 6;

export type GalleryImage = { id: string; url: string };

type GalleryRow = { id: number | string; image_url: string };

const GALLERY_ERROR_STATUS: Record<string, number> = { EF403: 403, EF404: 404, EF409: 409 };

export const IMAGE_ID_PATTERN = /^[1-9]\d{0,17}$/;

function toGalleryImage(row: GalleryRow): GalleryImage {
  return { id: String(row.id), url: row.image_url };
}

function galleryFailure(error: { code?: string; message: string }, action: string): Failure {
  const status = error.code ? GALLERY_ERROR_STATUS[error.code] : undefined;
  if (status) return { status, error: error.message };
  throw new Error(`Failed to ${action}: ${error.message}`);
}

export async function listGalleryImages(supabase: SupabaseClient, eventId: string): Promise<GalleryImage[] | null> {
  const event = await supabase.from('events').select('id').eq('id', eventId).maybeSingle();
  if (event.error) throw new Error(`Failed to look up event ${eventId}: ${event.error.message}`);
  if (!event.data) return null;

  const { data, error } = await supabase
    .from('event_images')
    .select('id, image_url')
    .eq('event_id', eventId)
    .order('id', { ascending: true });
  if (error) throw new Error(`Failed to load photos for event ${eventId}: ${error.message}`);
  return (data as GalleryRow[]).map(toGalleryImage);
}

export async function addGalleryImage(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  image: EventImage,
): Promise<{ image: GalleryImage } | Failure> {
  const event = await findOwnedEvent(supabase, userId, eventId);
  if ('status' in event) return event;

  const path = `${eventId}/gallery/${crypto.randomUUID()}.${image.extension}`;
  const bucket = supabase.storage.from(EVENT_IMAGE_BUCKET);
  const { error: uploadError } = await bucket.upload(path, image.bytes, { contentType: image.contentType, upsert: false });
  if (uploadError) throw new Error(`Failed to upload photo for event ${eventId}: ${uploadError.message}`);

  const imageUrl = bucket.getPublicUrl(path).data.publicUrl;
  let result: { data: unknown; error: { code?: string; message: string } | null };
  try {
    result = await supabase.rpc('add_event_image', { p_event_id: eventId, p_image_url: imageUrl }).single();
  } catch (error) {
    await removeStoredImage(supabase, path);
    throw error;
  }
  if (result.error) {
    await removeStoredImage(supabase, path);
    return galleryFailure(result.error, `add a photo to event ${eventId}`);
  }
  return { image: toGalleryImage(result.data as GalleryRow) };
}

export async function removeGalleryImage(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  imageId: string,
): Promise<{ removed: true } | Failure> {
  const event = await findOwnedEvent(supabase, userId, eventId);
  if ('status' in event) return event;

  const { data, error } = await supabase.rpc('remove_event_image', { p_event_id: eventId, p_image_id: imageId });
  if (error) return galleryFailure(error, `remove photo ${imageId} from event ${eventId}`);

  await removeStoredImage(supabase, storagePathFromUrl(data as string | null));
  return { removed: true };
}
