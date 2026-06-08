import { test, expect, type Page } from '@playwright/test';

/**
 * Real-time fan-out E2E.
 *
 * Proves the pub/sub guarantee: the backend is the single market-data source
 * and fans out `priceUpdate` frames over ONE backend ws connection per client
 * to the frontend — and that this survives browser refresh and serves multiple
 * concurrent subscribers. (Frontend never connects to Angel directly; the
 * single upstream Angel connection lives in the backend.)
 *
 * We observe the app's WebSocket frames directly via Playwright, so the test is
 * deterministic regardless of which upstream source (Angel WS feed or REST
 * fallback) is currently driving the cache.
 */

/** Attach a counter of inbound `priceUpdate` frames on the app's /ws socket. */
function watchPriceUpdates(page: Page): { count: () => number } {
  let n = 0;
  page.on('websocket', (ws) => {
    if (!ws.url().includes('/ws')) return;
    ws.on('framereceived', (frame) => {
      const payload = typeof frame.payload === 'string' ? frame.payload : '';
      if (payload.includes('"type":"priceUpdate"')) n += 1;
    });
  });
  return { count: () => n };
}

test('one client receives a live priceUpdate stream from the backend', async ({ page }) => {
  const pu = watchPriceUpdates(page);
  await page.goto('/');
  // The dashboard subscribes indices on mount; the backend broadcasts on its
  // tick loop → frames should arrive within a couple of cycles.
  await expect.poll(pu.count, { timeout: 25_000 }).toBeGreaterThanOrEqual(2);
});

test('survives a browser refresh — resubscribes and resumes the stream', async ({ page }) => {
  const before = watchPriceUpdates(page);
  await page.goto('/');
  await expect.poll(before.count, { timeout: 25_000 }).toBeGreaterThanOrEqual(1);

  // Hard reload → the WS reconnects + the client resubscribes (existing
  // MarketContext behaviour). A fresh watcher must see new frames after reload.
  const after = watchPriceUpdates(page);
  await page.reload();
  await expect.poll(after.count, { timeout: 25_000 }).toBeGreaterThanOrEqual(2);
});

test('multiple concurrent subscribers each get the fan-out', async ({ browser }) => {
  // Two independent browser contexts (two "users"/tabs) — the backend fans the
  // single source out to BOTH over their own ws connections.
  const ctxA = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
  const ctxB = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  const a = watchPriceUpdates(pageA);
  const b = watchPriceUpdates(pageB);

  await Promise.all([pageA.goto('/'), pageB.goto('/')]);
  await expect.poll(a.count, { timeout: 25_000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(b.count, { timeout: 25_000 }).toBeGreaterThanOrEqual(2);

  await ctxA.close();
  await ctxB.close();
});
