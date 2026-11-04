import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { api, clearSession, getSession, onSessionEnded, setSession } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => getSession() !== null);

  const refreshUser = useCallback(async () => {
    const { profile } = await api('/api/me/profile');
    setUser(profile);
    return profile;
  }, []);

  // Restore the login from an earlier visit.
  useEffect(() => {
    onSessionEnded(() => setUser(null));
    if (!getSession()) return undefined;

    let active = true;
    api('/api/me/profile')
      .then(({ profile }) => {
        if (active) setUser(profile);
      })
      .catch(() => {
        // Expired logins are cleared by api(); other failures just show logged out.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(
    async (session, remember = false) => {
      setSession(session, remember);
      return refreshUser();
    },
    [refreshUser],
  );

  const signOut = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // The local logout below still happens.
    }
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, refreshUser, setUser }),
    [user, loading, signIn, signOut, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

// Sends logged-out visitors to /login, then back here after they log in.
export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="app-message" role="status">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}
