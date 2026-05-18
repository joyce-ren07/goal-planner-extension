import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import { DaySection } from './DaySection';
import { ErrorState } from './ErrorState';
import { LoadingSpinner } from './LoadingSpinner';

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export function CalendarSidebar() {
  const { status, dayGroups, error, authenticate, refresh, disconnect } = useGoogleCalendar(clientId);

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-[360px] flex-col border-l border-[#e0e0e0] bg-white shadow-[-1px_0_0_#e0e0e0]">
      <header className="border-b border-[#e0e0e0] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#5f6368]">
              Google Calendar
            </p>
            <h1 className="mt-1 text-[22px] font-normal leading-7 text-[#1d1b20]">Upcoming events</h1>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-full px-3 py-2 text-sm font-medium text-[#1a73e8] transition hover:bg-[#e8f0fe]"
            >
              Refresh
            </button>
            {status === 'ready' ? (
              <button
                type="button"
                onClick={disconnect}
                className="rounded-full px-3 py-2 text-sm font-medium text-[#5f6368] transition hover:bg-[#f1f3f4]"
              >
                Sign out
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {status === 'loading' ? <LoadingSpinner /> : null}

        {status === 'needs-auth' ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-2 text-center">
            <p className="text-sm leading-6 text-[#5f6368]">
              Sign in with Google to load events from your primary calendar for the next 7 days.
            </p>
            <button
              type="button"
              onClick={() => void authenticate()}
              className="rounded-full bg-[#1a73e8] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#1765cc]"
            >
              Sign in with Google
            </button>
          </div>
        ) : null}

        {status === 'error' && error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}

        {status === 'ready' ? (
          dayGroups.length > 0 ? (
            <div className="space-y-6">
              {dayGroups.map((group) => (
                <DaySection key={group.key} group={group} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#dadce0] bg-[#f8f9fa] px-4 py-10 text-center text-sm text-[#5f6368]">
              No events scheduled for the next 7 days.
            </div>
          )
        ) : null}
      </div>
    </aside>
  );
}
