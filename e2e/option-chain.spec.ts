import { test, expect, type Route } from '@playwright/test';

/**
 * Option Chain E2E.
 *
 * The page renders strike rows whose premiums come from a 5s HTTP poll of
 * GET /api/market/options/:symbol. These specs prove:
 *   1. premiums render and UPDATE across poll cycles (the reported bug),
 *   2. the rendered cell is wired to the API payload,
 *   3. a degraded/empty/errored feed shows a clear "unavailable" state
 *      instead of a wall of ₹0.00 or silently-blank rows.
 *
 * Determinism: the live-update + expiry specs drive the poll with a controlled
 * route stub (no dependency on a live market or the shared broker account); one
 * spec hits the REAL backend and only asserts the page is never broken.
 */

const OPTIONS_GLOB = '**/api/market/options/**';

function leg(token: string, ltp: number) {
  return {
    symbol: `NIFTY${token}`, token, lotsize: '75',
    ltp, open: ltp, high: ltp, low: ltp,
    close: ltp * 0.9, volume: 1000 + Math.round(ltp), oi: 5000,
  };
}

function chain(ltpBase: number, expiry = '09JUN2026', expiries = ['09JUN2026', '16JUN2026']) {
  return {
    underlying: 'NIFTY', expiry, expiries, spot: 23250, lotSize: '75',
    rows: [
      { strike: 23200, ce: leg('A', ltpBase + 50), pe: leg('B', ltpBase + 5) },
      { strike: 23250, ce: leg('C', ltpBase + 30), pe: leg('D', ltpBase + 10) },
      { strike: 23300, ce: leg('E', ltpBase + 15), pe: leg('F', ltpBase + 25) },
    ],
  };
}

test.describe('Option Chain', () => {
  test('renders strike rows and premiums UPDATE across poll cycles', async ({ page }) => {
    // Each successive poll returns higher premiums → the rendered cell must
    // change, proving the poll → setData → re-render pipeline is live.
    let call = 0;
    await page.route(OPTIONS_GLOB, (route: Route) => {
      call += 1;
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(chain(100 + call * 20)),
      });
    });

    await page.goto('/options/NIFTY');

    const firstCe = page.getByTestId('oc-ce-premium').first();
    await expect(firstCe).toBeVisible();
    expect(await page.getByTestId('oc-row').count()).toBeGreaterThan(0);

    // No degraded panel while priced data flows.
    await expect(page.getByTestId('oc-unavailable')).toHaveCount(0);

    // Premium is a real, positive number — not "—" / "₹0.00".
    const v1 = await firstCe.textContent();
    expect(parseFloat((v1 || '').replace(/[₹,\s]/g, ''))).toBeGreaterThan(0);

    // After the next 5s poll the value must change (live update).
    await expect.poll(async () => firstCe.textContent(), { timeout: 20_000 }).not.toBe(v1);
  });

  test('rendered premium matches the latest API payload (wiring)', async ({ page }) => {
    await page.route(OPTIONS_GLOB, (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chain(200)) }),
    );
    await page.goto('/options/NIFTY');
    // chain(200): strike 23200 CE ltp = 250 → ₹250.00
    await expect(page.getByTestId('oc-ce-premium').first()).toHaveText('₹250.00');
    await expect(page.getByTestId('oc-pe-premium').first()).toHaveText('₹205.00');
  });

  test('real backend: page is never broken — live rows OR a clear unavailable state', async ({ page }) => {
    let polls = 0;
    page.on('response', (res) => {
      if (res.url().includes('/api/market/options/') && res.request().method() === 'GET') polls += 1;
    });
    await page.goto('/options/NIFTY');

    // Either the chain rows render, or the unavailable panel shows — never a
    // blank screen or a wall of zeros.
    await expect(
      page.getByTestId('oc-row').first().or(page.getByTestId('oc-unavailable')),
    ).toBeVisible();

    // The live refresh loop fires regardless (initial + poll).
    await expect.poll(() => polls, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);

    // If rows rendered, at least one premium must be a real number.
    if (await page.getByTestId('oc-row').count()) {
      const texts = await page.getByTestId('oc-ce-premium').allTextContents();
      const real = texts.some((t) => parseFloat(t.replace(/[₹,\s]/g, '')) > 0);
      expect(real, `rows present but no live CE premium: ${JSON.stringify(texts)}`).toBeTruthy();
    }
  });

  test('switching expiry re-fetches the chain', async ({ page }) => {
    const expiriesRequested: string[] = [];
    await page.route(OPTIONS_GLOB, (route: Route) => {
      const m = route.request().url().match(/[?&]expiry=([^&]+)/);
      if (m) expiriesRequested.push(decodeURIComponent(m[1]).toUpperCase());
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chain(200)) });
    });

    await page.goto('/options/NIFTY');
    await expect(page.getByTestId('oc-ce-premium').first()).toBeVisible();

    // Open the expiry picker (header chip shows formatted current expiry "09 Jun").
    await page.getByRole('button', { name: /09 Jun/ }).click();
    // Pick the second expiry (16 Jun).
    await page.getByRole('button', { name: /16 Jun/ }).click();

    await expect.poll(() => expiriesRequested.some((e) => e.includes('16JUN')), { timeout: 10_000 }).toBeTruthy();
  });

  test('clear unavailable state when the feed returns unpriced legs', async ({ page }) => {
    // Well-formed but ALL-ZERO chain — the shape Angel returns when throttled.
    await page.route(OPTIONS_GLOB, (route: Route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          underlying: 'NIFTY', expiry: '09JUN2026', expiries: ['09JUN2026'], spot: 23250, lotSize: '75',
          rows: [
            { strike: 23200, ce: leg('A', 0), pe: leg('B', 0) },
            { strike: 23250, ce: leg('C', 0), pe: leg('D', 0) },
          ],
        }),
      }),
    );
    await page.goto('/options/NIFTY');
    await expect(page.getByTestId('oc-unavailable')).toBeVisible();
    await expect(page.getByText('Live option prices unavailable')).toBeVisible();
    await expect(page.getByTestId('oc-row')).toHaveCount(0); // no silent zero rows
  });

  test('clear unavailable state when the endpoint errors', async ({ page }) => {
    await page.route(OPTIONS_GLOB, (route: Route) =>
      route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ error: 'Angel One not configured' }) }),
    );
    await page.goto('/options/NIFTY');
    await expect(page.getByTestId('oc-unavailable')).toBeVisible();
    await expect(page.getByText('Live option data unavailable')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.getByTestId('oc-row')).toHaveCount(0);
  });
});
