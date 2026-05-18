import { useCallback, useEffect, useState } from 'react';
import { fetchPrimaryCalendarEvents, groupEventsByDay } from '../lib/calendarApi';
import { getStoredToken, requestAccessToken, signIn, signOut } from '../lib/googleAuth';
import type { DayGroup } from '../types/calendar';

type SidebarStatus = 'loading' | 'ready' | 'error' | 'needs-auth';

interface SidebarState {
  status: SidebarStatus;
  dayGroups: DayGroup[];
  error: string | null;
}

const initialState: SidebarState = {
  status: 'loading',
  dayGroups: [],
  error: null,
};

export function useGoogleCalendar(clientId: string) {
  const [state, setState] = useState<SidebarState>(initialState);

  const loadEvents = useCallback(
    async (token: string) => {
      setState((current) => ({ ...current, status: 'loading', error: null }));

      try {
        const events = await fetchPrimaryCalendarEvents(token);
        setState({
          status: 'ready',
          dayGroups: groupEventsByDay(events),
          error: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not load calendar events.';
        setState({
          status: 'error',
          dayGroups: [],
          error: message,
        });
      }
    },
    [],
  );

  const authenticate = useCallback(async () => {
    if (!clientId) {
      setState({
        status: 'error',
        dayGroups: [],
        error: 'Set VITE_GOOGLE_CLIENT_ID in your .env file before signing in.',
      });
      return;
    }

    setState((current) => ({ ...current, status: 'loading', error: null }));

    try {
      const token = await signIn(clientId);
      await loadEvents(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign-in failed.';
      setState({
        status: 'error',
        dayGroups: [],
        error: message,
      });
    }
  }, [clientId, loadEvents]);

  const refresh = useCallback(async () => {
    if (!clientId) {
      setState({
        status: 'error',
        dayGroups: [],
        error: 'Set VITE_GOOGLE_CLIENT_ID in your .env file before signing in.',
      });
      return;
    }

    setState((current) => ({ ...current, status: 'loading', error: null }));

    try {
      const storedToken = getStoredToken();
      const token = storedToken || (await requestAccessToken(clientId));
      await loadEvents(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign-in failed.';
      setState({
        status: 'needs-auth',
        dayGroups: [],
        error: message,
      });
    }
  }, [clientId, loadEvents]);

  const disconnect = useCallback(() => {
    signOut();
    setState({
      status: 'needs-auth',
      dayGroups: [],
      error: null,
    });
  }, []);

  useEffect(() => {
    if (!clientId) {
      setState({
        status: 'error',
        dayGroups: [],
        error: 'Set VITE_GOOGLE_CLIENT_ID in your .env file before signing in.',
      });
      return;
    }

    void refresh();
  }, [clientId, refresh]);

  return {
    ...state,
    authenticate,
    refresh,
    disconnect,
  };
}
