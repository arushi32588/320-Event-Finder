import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api } from './api.js';
import { useAuth } from './auth.jsx';

// The logged-in user's saved event ids, and a toggle that updates the server.
// Logged-out visitors are sent to log in first.
export function useSavedEvents() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [savedIds, setSavedIds] = useState([]);
  const [error, setError] = useState('');
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setSavedIds([]);
      return undefined;
    }
    let active = true;
    api('/api/me/saved-events')
      .then(({ events }) => {
        if (active) setSavedIds(events.map((event) => event.id));
      })
      .catch(() => {
        // Events still show; they just won't be marked as saved.
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const toggleSaved = useCallback(
    async (eventId) => {
      if (!userId) {
        navigate('/login', { state: { from: location.pathname + location.search } });
        return;
      }
      const wasSaved = savedIds.includes(eventId);
      setError('');
      setSavedIds((ids) => (wasSaved ? ids.filter((id) => id !== eventId) : [...ids, eventId]));
      try {
        await api(`/api/events/${eventId}/save`, { method: wasSaved ? 'DELETE' : 'PUT' });
      } catch (err) {
        setSavedIds((ids) => (wasSaved ? [...ids, eventId] : ids.filter((id) => id !== eventId)));
        setError(err.message);
      }
    },
    [userId, savedIds, navigate, location.pathname, location.search],
  );

  return { savedIds, toggleSaved, error };
}
