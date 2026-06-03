const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  const networkRequests = [];

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[error] ${msg.text()}`);
  });
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
  page.on('response', resp => {
    if (resp.url().includes('/api/')) {
      networkRequests.push({ url: resp.url(), status: resp.status() });
    }
  });

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  console.log('=== STEP 1: LOGIN ===');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 15000 });
  
  const emailField = page.locator('input[type="email"], input[placeholder*="Email"], input[placeholder*="email"]').first();
  await emailField.fill('Gautam@yopmail.com');
  const passField = page.locator('input[type="password"]').first();
  await passField.fill('Test@123');
  await page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first().click();
  await page.waitForURL(/(?!.*login)/, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log('After login URL:', page.url());

  // ── TRADE PAGE — HARD RELOAD ───────────────────────────────────────────────
  console.log('\n=== STEP 2: TRADE PAGE (hard reload) ===');
  await page.goto('http://localhost:5173/trade', { waitUntil: 'networkidle', timeout: 15000 });
  // Hard reload
  await page.evaluate(() => location.reload(true));
  await page.waitForLoadState('networkidle', { timeout: 15000 });
  await page.waitForTimeout(3000); // let any async P&L calcs settle

  await page.screenshot({ path: '/tmp/pnl-trade-hero.png', fullPage: false });
  console.log('Screenshot saved: /tmp/pnl-trade-hero.png');

  // Extract hero P&L value
  const heroText = await page.evaluate(() => {
    // Look for "Today's P&L" label and its associated value
    const allText = document.body.innerText;
    const lines = allText.split('\n').map(l => l.trim()).filter(Boolean);
    const heroIdx = lines.findIndex(l => l.toLowerCase().includes("today") && l.toLowerCase().includes("p&l") || l.toLowerCase().includes("today's p&l") || l.toLowerCase().includes("todays p&l"));
    console.log('Lines around hero:', JSON.stringify(lines.slice(Math.max(0, heroIdx-2), heroIdx+5)));
    
    // Try to find the value — it's typically the next numeric line after the label
    if (heroIdx >= 0) {
      return {
        label: lines[heroIdx],
        nearby: lines.slice(Math.max(0, heroIdx-3), heroIdx+6)
      };
    }
    return { label: null, nearby: lines.slice(0, 20) };
  });
  console.log('Hero P&L area text:', JSON.stringify(heroText, null, 2));

  // More targeted extraction - look for specific elements
  const heroValue = await page.evaluate(() => {
    // Try common patterns for a P&L hero card
    const selectors = [
      '[data-testid*="pnl"]',
      '[data-testid*="hero"]', 
      '.hero',
      '[class*="hero"]',
      '[class*="pnl"]',
      '[class*="PnL"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return { selector: sel, text: el.innerText };
    }
    
    // Fallback: scan for "Today" heading cards
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, p, span, div'));
    const todayPnlEl = headings.find(el => {
      const t = el.innerText || '';
      return (t.toLowerCase().includes("today") && t.toLowerCase().includes("p&l")) ||
             t.toLowerCase().includes("today's p&l");
    });
    if (todayPnlEl) {
      // Get parent card
      const card = todayPnlEl.closest('[class*="card"], section, article, .bg-');
      return { 
        elementText: todayPnlEl.innerText, 
        cardText: card ? card.innerText.substring(0, 200) : null 
      };
    }
    return null;
  });
  console.log('Hero value extraction:', JSON.stringify(heroValue, null, 2));

  // Get the top portion of page text to see the hero section
  const topPageText = await page.evaluate(() => {
    return document.body.innerText.substring(0, 800);
  });
  console.log('Top page text (first 800 chars):\n', topPageText);

  // ── HISTORY TAB ───────────────────────────────────────────────────────────
  console.log('\n=== STEP 3: HISTORY TAB ===');
  
  // Find and click the History tab
  const historyTab = page.locator('button:has-text("History"), [role="tab"]:has-text("History"), a:has-text("History")').first();
  const historyExists = await historyTab.count();
  console.log('History tab found:', historyExists > 0);
  
  if (historyExists > 0) {
    await historyTab.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/pnl-history-tab.png', fullPage: false });
    console.log('Screenshot saved: /tmp/pnl-history-tab.png');

    const historyText = await page.evaluate(() => {
      return document.body.innerText.substring(0, 1500);
    });
    console.log('History tab page text (first 1500 chars):\n', historyText);

    // Look for P&L Today in history
    const historyPnL = await page.evaluate(() => {
      const allText = document.body.innerText;
      const lines = allText.split('\n').map(l => l.trim()).filter(Boolean);
      const pnlIdx = lines.findIndex(l => 
        (l.toLowerCase().includes("p&l") && l.toLowerCase().includes("today")) ||
        l.toLowerCase().includes("realised") ||
        l.toLowerCase().includes("realized")
      );
      return {
        pnlLine: pnlIdx >= 0 ? lines[pnlIdx] : null,
        nearby: pnlIdx >= 0 ? lines.slice(Math.max(0, pnlIdx-3), pnlIdx+8) : lines.slice(0, 20)
      };
    });
    console.log('History P&L area:', JSON.stringify(historyPnL, null, 2));
  }

  // ── ANALYTICS PAGE ────────────────────────────────────────────────────────
  console.log('\n=== STEP 4: ANALYTICS PAGE ===');
  await page.goto('http://localhost:5173/analytics', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);

  // Make sure "Today" preset is selected
  const todayPreset = page.locator('button:has-text("Today"), [data-testid*="today"]').first();
  const todayExists = await todayPreset.count();
  if (todayExists > 0) {
    await todayPreset.click();
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: '/tmp/pnl-analytics.png', fullPage: false });
  console.log('Screenshot saved: /tmp/pnl-analytics.png');

  const analyticsText = await page.evaluate(() => {
    return document.body.innerText.substring(0, 1500);
  });
  console.log('Analytics page text (first 1500 chars):\n', analyticsText);

  const analyticsNetPnL = await page.evaluate(() => {
    const allText = document.body.innerText;
    const lines = allText.split('\n').map(l => l.trim()).filter(Boolean);
    const netIdx = lines.findIndex(l => 
      l.toLowerCase().includes("net p&l") ||
      l.toLowerCase().includes("net pnl") ||
      (l.toLowerCase().includes("net") && l.toLowerCase().includes("p&l"))
    );
    return {
      netLine: netIdx >= 0 ? lines[netIdx] : null,
      nearby: netIdx >= 0 ? lines.slice(Math.max(0, netIdx-3), netIdx+8) : lines.slice(0, 25)
    };
  });
  console.log('Analytics Net P&L:', JSON.stringify(analyticsNetPnL, null, 2));

  // ── CONSOLE ERRORS ────────────────────────────────────────────────────────
  console.log('\n=== CONSOLE ERRORS ===');
  const filteredErrors = errors.filter(e => !e.includes('WebSocket') && !e.includes('HMR') && !e.includes('ws://'));
  if (filteredErrors.length === 0) console.log('No relevant console errors.');
  else filteredErrors.forEach(e => console.log(e));

  console.log('\n=== API REQUESTS ===');
  networkRequests.slice(0, 20).forEach(r => console.log(r.status, r.url));

  await browser.close();
  console.log('\n=== DONE ===');
})().catch(e => { console.error('SCRIPT ERROR:', e); process.exit(1); });
