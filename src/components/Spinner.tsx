/**
 * Generic SVG circular loader. Indeterminate progress — used everywhere we
 * need a "first API call in flight" indication. Inherits `color` from
 * `currentColor` so caller can theme it via Tailwind text colors.
 *
 *   <Spinner size={20} />          // small, inline
 *   <Spinner size={48} thickness={3.5} />  // hero loader on a splash / modal
 */
import React from 'react';

interface Props {
  size?: number;
  thickness?: number;
  className?: string;
  label?: string;
}

export function Spinner({ size = 24, thickness = 3, className = '', label = 'Loading' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 50 50"
      role="status"
      aria-label={label}
      className={`inline-block animate-spin ${className}`}
    >
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        strokeWidth={thickness}
        className="circle-loader-track"
      />
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        strokeWidth={thickness}
        strokeLinecap="round"
        className="circle-loader-arc"
        stroke="currentColor"
      />
    </svg>
  );
}

/** Centered loader with optional label for empty-state cards. */
export function CenteredSpinner({ size = 28, label }: { size?: number; label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-ink-500 dark:text-night-200">
      <Spinner size={size} />
      {label && <span className="text-xs">{label}</span>}
    </div>
  );
}
