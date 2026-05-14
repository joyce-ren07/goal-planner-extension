export function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-sm text-[#5f6368]">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-[#dadce0] border-t-[#1a73e8]"
        aria-hidden="true"
      />
      <p>Loading events...</p>
    </div>
  );
}
