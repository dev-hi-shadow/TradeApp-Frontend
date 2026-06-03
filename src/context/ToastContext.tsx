import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  title?: string;
  message: string;
}

interface ToastCtx {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = seq.current++;
      setToasts((cur) => [...cur, { ...t, id }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  return (
    <Ctx.Provider value={{ toasts, push, dismiss }}>
      {children}
      <ToastViewport />
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used within ToastProvider');
  return v;
}

function ToastViewport() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="fixed z-50 top-3 right-3 left-3 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const tone =
          t.kind === 'success'
            ? 'border-l-pos'
            : t.kind === 'error'
              ? 'border-l-neg'
              : t.kind === 'warning'
                ? 'border-l-amber-500'
                : 'border-l-brand';
        return (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 border-l-4 ${tone}
                        bg-white dark:bg-night-700
                        border-y border-r border-ink-100 dark:border-night-500/40
                        shadow-cardHover animate-slideUp`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                {t.title && (
                  <div className="font-semibold text-sm tracking-tight text-ink-800 dark:text-night-50">
                    {t.title}
                  </div>
                )}
                <div className="text-sm text-ink-600 dark:text-night-100">{t.message}</div>
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-ink-400 dark:text-night-200 hover:text-ink-700 dark:hover:text-night-50 text-xl leading-none"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
