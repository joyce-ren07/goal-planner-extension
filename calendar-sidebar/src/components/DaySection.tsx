import type { DayGroup } from '../types/calendar';
import { EventCard } from './EventCard';

interface DaySectionProps {
  group: DayGroup;
}

export function DaySection({ group }: DaySectionProps) {
  return (
    <section className="space-y-3">
      <h2 className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-[#5f6368]">
        {group.label}
      </h2>
      <div className="space-y-2">
        {group.events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}
