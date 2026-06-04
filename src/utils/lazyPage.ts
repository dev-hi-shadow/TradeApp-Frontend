import { lazy, ComponentType } from 'react';

/**
 * React.lazy for our NAMED-export pages, with stale-chunk recovery.
 *
 * After every deploy the content-hashed chunk filenames change; a tab that
 * kept the old index.html open will 404 when it tries to lazy-load a page
 * ("Failed to fetch dynamically imported module"). When that happens we
 * hard-reload ONCE (sessionStorage-throttled) to pick up the fresh build
 * instead of stranding the user on a broken navigation.
 */
export function lazyPage<M extends Record<string, ComponentType<any>>>(
  loader: () => Promise<M>,
  name: keyof M,
) {
  return lazy(async () => {
    try {
      const mod = await loader();
      return { default: mod[name] };
    } catch (err) {
      const KEY = 'chunk-reload-at';
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
      throw err;
    }
  });
}
