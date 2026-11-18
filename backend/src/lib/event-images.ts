import type { SupabaseClient } from '@supabase/supabase-js';

export const EVENT_IMAGE_BUCKET = 'event-images';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ImageType = { contentType: string; extension: string };

export type EventImage = { bytes: Uint8Array; contentType: string; extension: string };

export type Failure = { status: number; error: string };

const IMAGE_TYPES: Record<string, ImageType> = {
  'image/jpeg': { contentType: 'image/jpeg', extension: 'jpg' },
  'image/png': { contentType: 'image/png', extension: 'png' },
  'image/webp': { contentType: 'image/webp', extension: 'webp' },
};

const IMAGE_ERROR_STATUS: Record<string, number> = { EF403: 403, EF404: 404 };

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return IMAGE_TYPES['image/jpeg'];
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return IMAGE_TYPES['image/png'];
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return IMAGE_TYPES['image/webp'];
  }
  return null;
}

function megabytes(size: number): string {
  return (size / (1024 * 1024)).toFixed(1);
}

export async function readEventImage(request: Request): Promise<{ image: EventImage } | { error: string }> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { error: 'Send the photo as a file upload in the "image" field.' };
  }

  const file = form.get('image');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a photo.' };
  if (!IMAGE_TYPES[file.type]) return { error: 'Use a JPEG, PNG or WebP image.' };
  if (file.size > MAX_IMAGE_BYTES) return { error: `That file is ${megabytes(file.size)} MB. Photos can be up to 5 MB.` };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) return { error: 'That file is not a JPEG, PNG or WebP image.' };
  return { image: { bytes, ...type } };
}

export function storagePathFromUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  const marker = `/storage/v1/object/public/${EVENT_IMAGE_BUCKET}/`;
  const index = imageUrl.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(imageUrl.slice(index + marker.length));
}

export async function findOwnedEvent(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<{ imageUrl: string | null } | Failure> {
  const { data, error } = await supabase
    .from('events')
    .select('submitted_by_user_id, image_url')
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw new Error(`Failed to look up event ${eventId}: ${error.message}`);

  const row = data as { submitted_by_user_id: string | null; image_url: string | null } | null;
  if (!row) return { status: 404, error: 'Event not found' };
  if (row.submitted_by_user_id !== userId) {
    return { status: 403, error: 'Only the person who submitted this event can change its photo.' };
  }
  return { imageUrl: row.image_url };
}

async function setEventImage(supabase: SupabaseClient, eventId: string, imageUrl: string | null): Promise<Failure | null> {
  const { error } = await supabase.rpc('set_event_image', { p_event_id: eventId, p_image_url: imageUrl });
  if (!error) return null;
  const status = error.code ? IMAGE_ERROR_STATUS[error.code] : undefined;
  if (status) return { status, error: error.message };
  throw new Error(`Failed to set image for event ${eventId}: ${error.message}`);
}

export async function removeStoredImage(supabase: SupabaseClient, path: string | null): Promise<void> {
  if (!path) return;
  const { error } = await supabase.storage.from(EVENT_IMAGE_BUCKET).remove([path]);
  if (error) console.error(`Failed to remove old event image ${path}: ${error.message}`);
}

export async function uploadEventImage(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  image: EventImage,
): Promise<{ imageUrl: string } | Failure> {
  const event = await findOwnedEvent(supabase, userId, eventId);
  if ('status' in event) return event;

  const path = `${eventId}/${crypto.randomUUID()}.${image.extension}`;
  const bucket = supabase.storage.from(EVENT_IMAGE_BUCKET);
  const { error: uploadError } = await bucket.upload(path, image.bytes, { contentType: image.contentType, upsert: false });
  if (uploadError) throw new Error(`Failed to upload image for event ${eventId}: ${uploadError.message}`);

  const imageUrl = bucket.getPublicUrl(path).data.publicUrl;
  let failure: Failure | null;
  try {
    failure = await setEventImage(supabase, eventId, imageUrl);
  } catch (error) {
    await removeStoredImage(supabase, path);
    throw error;
  }
  if (failure) {
    await removeStoredImage(supabase, path);
    return failure;
  }

  await removeStoredImage(supabase, storagePathFromUrl(event.imageUrl));
  return { imageUrl };
}

export async function removeEventImage(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<{ imageUrl: null } | Failure> {
  const event = await findOwnedEvent(supabase, userId, eventId);
  if ('status' in event) return event;

  const failure = await setEventImage(supabase, eventId, null);
  if (failure) return failure;

  await removeStoredImage(supabase, storagePathFromUrl(event.imageUrl));
  return { imageUrl: null };
}
