// All backend calls go through here. It adds the login token, renews it when it
// expires, and turns failures into ApiError with a message that's safe to show.
const STORAGE_KEY = 'event-finder-session';

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields ?? {};
  }
}

// Browser storage can throw (private windows, blocked site data), so a failure
// here just means the user stays logged in for this page only.
let memorySession = null;
let sessionEndedListener = null;

function readStorage(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getSession() {
  return memorySession ?? readStorage(sessionStorage) ?? readStorage(localStorage);
}

// "Remember me" keeps the login after the browser closes; otherwise it lasts
// until the tab is closed.
export function setSession(session, remember) {
  clearSession();
  memorySession = session;
  try {
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Kept in memory instead.
  }
}

export function clearSession() {
  memorySession = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}

export function onSessionEnded(listener) {
  sessionEndedListener = listener;
}

function isRemembered() {
  return readStorage(localStorage) !== null;
}

async function send(path, { method = 'GET', body, token }) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    return await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }
}

async function readBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// Two requests can expire at once, so they share one renewal.
let refreshing = null;

function refreshSession() {
  refreshing ??= (async () => {
    const session = getSession();
    if (!session?.refreshToken) return null;
    const remember = isRemembered();
    const response = await send('/api/auth/refresh', { method: 'POST', body: { refreshToken: session.refreshToken } });
    if (!response.ok) return null;
    const data = await readBody(response);
    if (!data?.session) return null;
    setSession(data.session, remember);
    return data.session;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api(path, options = {}) {
  const session = getSession();
  let response = await send(path, { ...options, token: session?.accessToken });

  if (response.status === 401 && session?.refreshToken) {
    const renewed = await refreshSession().catch(() => null);
    if (renewed) {
      response = await send(path, { ...options, token: renewed.accessToken });
    } else {
      clearSession();
      sessionEndedListener?.();
    }
  }

  const data = await readBody(response);
  if (!response.ok) {
    throw new ApiError(data?.error ?? 'Something went wrong. Please try again.', response.status, data?.fields);
  }
  return data;
}
