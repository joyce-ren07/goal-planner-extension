interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="mx-4 my-6 rounded-xl border border-[#f6aea9] bg-[#fce8e6] px-4 py-4 text-sm text-[#c5221f]">
      <p className="font-medium">Could not load your calendar</p>
      <p className="mt-2 leading-6">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-medium text-[#c5221f] transition hover:bg-[#fff7f6]"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
