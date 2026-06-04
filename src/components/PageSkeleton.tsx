/**
 * Shimmer placeholder shown inside the Shell while a lazy page chunk loads.
 * Mirrors the typical page anatomy (hero card → stat tiles → big panel) so the
 * swap to real content feels seamless rather than a spinner-flash.
 */
export function PageSkeleton() {
  return (
    <div className="px-3 sm:px-0 space-y-4 animate-pulse" aria-busy="true" aria-label="Loading page">
      <div className="h-28 rounded-2xl bg-ink-100/80 dark:bg-night-700" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-ink-100/80 dark:bg-night-700" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-ink-100/80 dark:bg-night-700" />
      <div className="h-36 rounded-2xl bg-ink-100/80 dark:bg-night-700" />
    </div>
  );
}
