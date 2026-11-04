import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Newer Node versions have their own empty localStorage that hides the browser
// one during tests, so give tests a working one.
if (!globalThis.localStorage) {
  const items = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => (items.has(key) ? items.get(key) : null),
      setItem: (key, value) => items.set(key, String(value)),
      removeItem: (key) => items.delete(key),
      clear: () => items.clear(),
    },
  });
}

afterEach(() => {
  cleanup();
});
