/**
 * Web Push subscription helper.
 *
 * Registers the service worker, subscribes to the browser's push service with
 * the backend's VAPID public key, and posts the subscription to the backend so
 * it can deliver notifications even when the app is closed.
 *
 * Safe to call repeatedly (idempotent) and on unsupported / insecure contexts
 * (http on a LAN IP) — it simply no-ops there, since `serviceWorker` /
 * `PushManager` only exist in secure contexts (HTTPS or localhost).
 */
import { api } from '../api/client';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Register the SW (once). Returns the ready registration, or null if unsupported. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    await navigator.serviceWorker.register('/sw.js');
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/**
 * Ensure the current browser is subscribed and the backend knows about it.
 * Requires Notification permission === 'granted'. Idempotent: reuses an
 * existing subscription and just re-posts it to the backend.
 */
export async function ensurePushSubscription(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  const reg = await registerServiceWorker();
  if (!reg) return false;

  // Need the server's VAPID public key (and confirmation push is enabled).
  let key: string | null = null;
  try {
    const r = await api<{ key: string | null; enabled: boolean }>('/api/push/vapid-public-key');
    if (!r.enabled || !r.key) return false;
    key = r.key;
  } catch {
    return false;
  }

  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
      });
    }
    await api('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return true;
  } catch {
    return false;
  }
}

/** Best-effort unsubscribe (e.g. on logout). */
export async function removePushSubscription(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api('/api/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}
