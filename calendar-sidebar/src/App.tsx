import { CalendarSidebar } from './components/CalendarSidebar';

export default function App() {
  return (
  <div className="min-h-screen bg-[#f1f3f4]">
      <main className="mr-[360px] px-8 py-10">
        <div className="max-w-2xl rounded-2xl border border-[#e0e0e0] bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-medium text-[#1f1f1f]">Calendar sidebar preview</h1>
          <p className="mt-3 text-sm leading-6 text-[#5f6368]">
            The fixed sidebar on the right uses Google OAuth and the Calendar API to load your real
            events for today and the next 7 days. Add your OAuth client ID to a local
            <code className="mx-1 rounded bg-[#f1f3f4] px-1.5 py-0.5">.env</code>
            file, then sign in from the sidebar.
          </p>
        </div>
      </main>
      <CalendarSidebar />
    </div>
  );
}
