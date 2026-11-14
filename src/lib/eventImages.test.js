import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MAX_IMAGE_BYTES, removeEventImage, resetMockImages, uploadEventImage, useEventImageUrl, validateImage } from './eventImages.js';

const photo = (type = 'image/png', size = 1000) => {
  const file = new File(['x'], 'photo.png', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

afterEach(resetMockImages);

describe('validateImage', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(validateImage(photo(type))).toBeNull();
  });

  it('refuses other file types', () => {
    expect(validateImage(photo('image/gif'))).toBe('Use a JPEG, PNG or WebP image.');
    expect(validateImage(photo('application/pdf'))).toBe('Use a JPEG, PNG or WebP image.');
  });

  it('accepts exactly 5 MB and refuses anything bigger, saying how big it was', () => {
    expect(validateImage(photo('image/jpeg', MAX_IMAGE_BYTES))).toBeNull();
    expect(validateImage(photo('image/jpeg', 8.2 * 1024 * 1024))).toBe('That file is 8.2 MB. Photos can be up to 5 MB.');
  });
});

describe('uploads (mock)', () => {
  it('shows an uploaded photo instead of the event’s own, and none once removed', async () => {
    const event = { id: '7', imageUrl: 'https://example.org/old.jpg' };
    const { result } = renderHook(() => useEventImageUrl(event));
    expect(result.current).toBe('https://example.org/old.jpg');

    let url;
    await act(async () => {
      url = await uploadEventImage('7', photo());
    });
    expect(url).toMatch(/^blob:/);
    expect(result.current).toBe(url);

    await act(() => removeEventImage('7'));
    expect(result.current).toBeNull();
  });

  it('refuses a bad file with a 400', async () => {
    await expect(uploadEventImage('7', photo('image/gif'))).rejects.toMatchObject({ status: 400, message: 'Use a JPEG, PNG or WebP image.' });
  });
});
