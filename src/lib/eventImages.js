// Event cover photos. Each function matches one planned backend route (see
// docs/specs/2026-11-14-event-chat-and-cover-photos-design.md).
//
// MOCK: there is no upload backend yet, so uploads are kept in memory as object
// URLs. They last while moving around the app but not after a reload. To connect
// the backend, replace the bodies with the api(...) calls in the comments, and
// make useEventImageUrl return event.imageUrl (the server then sets it).
import { useSyncExternalStore } from 'react';
import { ApiError } from './api.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 400;
const wait = () => new Promise((resolve) => setTimeout(resolve, DELAY_MS));

// The same rules the backend will apply. Returns an error message, or null.
export function validateImage(file) {
  if (!file) return 'Choose a photo.';
  if (!IMAGE_TYPES.includes(file.type)) return 'Use a JPEG, PNG or WebP image.';
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `That file is ${mb} MB. Photos can be up to 5 MB.`;
  }
  return null;
}

// eventId -> object URL, or null once removed.
const uploads = new Map();
const listeners = new Set();

function store(eventId, url) {
  const key = String(eventId);
  const old = uploads.get(key);
  if (old) URL.revokeObjectURL(old);
  uploads.set(key, url);
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Tests start each case with no uploads.
export function resetMockImages() {
  uploads.forEach((url) => url && URL.revokeObjectURL(url));
  uploads.clear();
  listeners.forEach((listener) => listener());
}

// PUT /api/me/events/:id/image  (multipart, field "image") -> { imageUrl }
export async function uploadEventImage(eventId, file) {
  const error = validateImage(file);
  if (error) throw new ApiError(error, 400);
  await wait();
  const imageUrl = URL.createObjectURL(file);
  store(eventId, imageUrl);
  return imageUrl;
}

// DELETE /api/me/events/:id/image -> { imageUrl: null }
export async function removeEventImage(eventId) {
  await wait();
  store(eventId, null);
}

// The photo to show for an event: a fresh upload if there is one, else the
// event's own imageUrl.
export function useEventImageUrl(event) {
  const key = String(event.id);
  const read = () => (uploads.has(key) ? uploads.get(key) : (event.imageUrl ?? null));
  return useSyncExternalStore(subscribe, read, read);
}
