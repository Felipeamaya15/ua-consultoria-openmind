export function MinimalCartIcon({ count }: { count: number }) {
  return (
    <div className="relative">
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.7}
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>

      {count > 0 && (
        <span className="absolute -top-2 -right-2 min-w-4 h-4 px-1 rounded-full bg-white text-[var(--primary)] text-[10px] font-bold flex items-center justify-center">
          {count}
        </span>
      )}
    </div>
  );
}
