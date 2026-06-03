import { useMarket } from '../context/MarketContext';

export function ConnectionBadge() {
  const { status, reconnect } = useMarket();
  const live = status === 'open';
  const connecting = status === 'connecting';

  const dot = live
    ? 'bg-pos'
    : connecting
      ? 'bg-amber-400'
      : status === 'error'
        ? 'bg-neg'
        : 'bg-ink-300 dark:bg-night-400';

  const label = live
    ? 'Live'
    : connecting
      ? 'Connecting'
      : status === 'error'
        ? 'Error'
        : status === 'closed'
          ? 'Offline'
          : 'Idle';

  return (
    <button
      onClick={!live ? reconnect : undefined}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                 bg-ink-50 dark:bg-night-600 text-ink-600 dark:text-night-100
                 hover:bg-ink-100 dark:hover:bg-night-500 transition"
      title={live ? 'WebSocket connected' : 'Click to reconnect'}
    >
      <span className={`relative inline-flex w-2 h-2 rounded-full ${dot}`}>
        {live && (
          <span className="absolute inset-0 rounded-full animate-ping bg-pos opacity-50" />
        )}
      </span>
      <span>{label}</span>
    </button>
  );
}
