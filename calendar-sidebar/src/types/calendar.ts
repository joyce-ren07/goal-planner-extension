export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color: string;
  isAllDay: boolean;
}

export interface DayGroup {
  key: string;
  label: string;
  events: CalendarEvent[];
}

export interface GoogleCalendarEventItem {
  id: string;
  summary?: string;
  colorId?: string;
  start?: {
    dateTime?: string;
    date?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
  };
}

export interface GoogleCalendarEventsResponse {
  items?: GoogleCalendarEventItem[];
  error?: {
    message?: string;
  };
}
