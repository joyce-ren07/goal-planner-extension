import type {
  CalendarEvent,
  DayGroup,
  GoogleCalendarEventItem,
  GoogleCalendarEventsResponse,
} from '../types/calendar';

const EVENT_COLOR_BY_ID: Record<string, string> = {
  '1': '#7986cb',
  '2': '#33b679',
  '3': '#8e24aa',
  '4': '#e67c73',
  '5': '#f6bf26',
  '6': '#f4511e',
  '7': '#039be5',
  '8': '#616161',
  '9': '#3f51b5',
  '10': '#0b8043',
  '11': '#d50000',
};

const DEFAULT_EVENT_COLOR = '#1a73e8';

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getEventWindow() {
  const now = new Date();
  return {
    timeMin: startOfDay(now).toISOString(),
    timeMax: endOfDay(addDays(now, 7)).toISOString(),
  };
}

function parseEventDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatEventTime(event: CalendarEvent) {
  if (event.isAllDay) return 'All day';
  return `${formatTime(event.start)} – ${formatTime(event.end)}`;
}

function formatDayLabel(date: Date) {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function dayKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function normalizeEvent(item: GoogleCalendarEventItem): CalendarEvent | null {
  const isAllDay = Boolean(item.start?.date);
  const start = parseEventDate(item.start?.dateTime || item.start?.date);
  const end = parseEventDate(item.end?.dateTime || item.end?.date);

  if (!start) return null;

  return {
    id: item.id,
    title: item.summary?.trim() || 'Untitled event',
    start,
    end: end || start,
    color: EVENT_COLOR_BY_ID[item.colorId || ''] || DEFAULT_EVENT_COLOR,
    isAllDay,
  };
}

export function groupEventsByDay(events: CalendarEvent[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();

  for (const event of events) {
    const key = dayKey(event.start);
    const existing = groups.get(key);

    if (existing) {
      existing.events.push(event);
      continue;
    }

    groups.set(key, {
      key,
      label: formatDayLabel(event.start),
      events: [event],
    });
  }

  return [...groups.values()].map((group) => ({
    ...group,
    events: [...group.events].sort((left, right) => left.start.getTime() - right.start.getTime()),
  }));
}

export async function fetchPrimaryCalendarEvents(token: string): Promise<CalendarEvent[]> {
  const { timeMin, timeMax } = getEventWindow();
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const payload = (await response.json()) as GoogleCalendarEventsResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || `Calendar API request failed (${response.status}).`);
  }

  return (payload.items || [])
    .map(normalizeEvent)
    .filter((event): event is CalendarEvent => Boolean(event));
}
