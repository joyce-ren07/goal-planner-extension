import type { CalendarEvent } from '../types/calendar';
import { formatEventTime } from '../lib/calendarApi';

interface EventCardProps {
  event: CalendarEvent;
}

export function EventCard({ event }: EventCardProps) {
  return (
    <article className="flex gap-3 rounded-xl border border-[#e0e0e0] bg-white px-3 py-3 shadow-sm">
      <span
        className="mt-1 h-10 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: event.color }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-[#1f1f1f]">{event.title}</h3>
        <p className="mt-1 text-xs text-[#5f6368]">{formatEventTime(event)}</p>
      </div>
    </article>
  );
}
