/**
 * Google Sign-In button via Google Identity Services (GIS).
 *
 * Zero frontend config needed: it asks the backend (/api/auth/config) whether
 * Google is enabled and for the (public) client id. So enabling Google is a
 * SINGLE backend env var — GOOGLE_SIGNIN_CLIENT_ID — with no frontend rebuild.
 * (An optional VITE_GOOGLE_CLIENT_ID still works as a fallback if you prefer.)
 *
 * The GIS script (accounts.google.com/gsi/client) is loaded once on demand. On
 * success Google hands us a short-lived ID token (`credential`) which we pass to
 * the backend for verification → it issues our own session.
 */
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getAuthConfig } from '../../api/auth';

const ENV_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

let gisLoad: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (gisLoad) return gisLoad;
  gisLoad = new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.id) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.appendChild(s);
  });
  return gisLoad;
}

export function GoogleSignInButton({ onDone }: { onDone?: () => void }) {
  const { loginWithGoogle } = useAuth();
  const toast = useToast();
  const elRef = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string>('');

  // Ask the server whether Google sign-in is configured + for the client id.
  // Falls back to the optional build-time env var if the server didn't supply one.
  useEffect(() => {
    let alive = true;
    getAuthConfig()
      .then((c) => {
        if (!alive) return;
        if (c.googleSignIn && (c.googleClientId || ENV_CLIENT_ID)) {
          setClientId(c.googleClientId || ENV_CLIENT_ID);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!clientId || !elRef.current) return;
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !elRef.current) return;
        const google = (window as any).google;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: async (resp: { credential: string }) => {
            try {
              await loginWithGoogle(resp.credential);
              onDone?.();
            } catch (err: any) {
              toast.push({ kind: 'error', title: 'Google sign-in failed', message: err.message });
            }
          },
        });
        // Match the app's design: full card width (GIS caps at 400px),
        // rectangular like our rounded-lg buttons, dark-aware theme.
        const width = Math.min(400, Math.max(200, elRef.current.offsetWidth || 352));
        const dark = document.documentElement.classList.contains('dark');
        google.accounts.id.renderButton(elRef.current, {
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          width,
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!clientId) return null;

  return (
    <>
      <div className="divider my-5 relative">
        <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 px-2 bg-white dark:bg-night-700 text-[11px] uppercase tracking-wide text-ink-400 dark:text-night-300">
          or
        </span>
      </div>
      <div className="w-full [&>div]:!w-full flex justify-center" ref={elRef} />
    </>
  );
}
